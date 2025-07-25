import { log, err } from "$utils/unifiedLogger";
import { clusterConn } from "$lib/couchbaseConnector";
import { backendConfig } from "../../backend-config";

export interface UsageMetrics {
  id: string;
  userId?: string;
  sessionId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  timestamp: string;
  conversationId?: string;
  toolUsage?: {
    toolsExecuted: number;
    toolExecutionTime: number;
  };
  metadata?: Record<string, any>;
}

export interface UsageAggregation {
  totalTokens: number;
  totalCost: number;
  conversationCount: number;
  averageTokensPerConversation: number;
  averageCostPerConversation: number;
  period: string;
  model: string;
}

export class UsageTrackingService {
  private collectionName = "usage_metrics";
  private bucketName: string;

  constructor() {
    this.bucketName = backendConfig.capella.BUCKET;
    log("🔧 [UsageTracking] Service initialized", {
      bucket: this.bucketName,
      collection: this.collectionName,
    });
  }

  async recordUsage(metrics: Omit<UsageMetrics, "id" | "timestamp">): Promise<void> {
    try {
      const cluster = await clusterConn();
      const bucket = cluster.bucket(this.bucketName);
      const collection = bucket.scope("_default").collection(this.collectionName);

      const usageRecord: UsageMetrics = {
        ...metrics,
        id: `usage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
      };

      await collection.upsert(usageRecord.id, usageRecord);

      log("📊 [UsageTracking] Usage recorded", {
        id: usageRecord.id,
        model: usageRecord.model,
        totalTokens: usageRecord.totalTokens,
        cost: usageRecord.estimatedCost,
        userId: usageRecord.userId,
      });
    } catch (error) {
      err("❌ [UsageTracking] Failed to record usage", {
        error: error.message,
        metrics: JSON.stringify(metrics).substring(0, 200),
      });
      throw error;
    }
  }

  async getUserUsage(
    userId: string,
    startDate?: string,
    endDate?: string
  ): Promise<UsageAggregation[]> {
    try {
      const cluster = await clusterConn();
      const bucket = cluster.bucket(this.bucketName);

      let whereClause = `WHERE userId = $userId`;
      const parameters: Record<string, any> = { userId };

      if (startDate) {
        whereClause += ` AND timestamp >= $startDate`;
        parameters.startDate = startDate;
      }

      if (endDate) {
        whereClause += ` AND timestamp <= $endDate`;
        parameters.endDate = endDate;
      }

      const query = `
        SELECT 
          model,
          SUM(totalTokens) as totalTokens,
          SUM(estimatedCost) as totalCost,
          COUNT(*) as conversationCount,
          AVG(totalTokens) as averageTokensPerConversation,
          AVG(estimatedCost) as averageCostPerConversation,
          DATE_TRUNC_STR(timestamp, 'day') as period
        FROM \`${this.bucketName}\`.\`_default\`.\`${this.collectionName}\`
        ${whereClause}
        GROUP BY model, DATE_TRUNC_STR(timestamp, 'day')
        ORDER BY period DESC, model
      `;

      const result = await bucket.scope("_default").query(query, { parameters });
      const rows = await result.rows;

      log("📈 [UsageTracking] Retrieved user usage", {
        userId,
        periodCount: rows.length,
        startDate,
        endDate,
      });

      return rows;
    } catch (error) {
      err("❌ [UsageTracking] Failed to retrieve user usage", {
        error: error.message,
        userId,
      });
      throw error;
    }
  }

  async getSystemUsage(
    startDate?: string,
    endDate?: string
  ): Promise<UsageAggregation[]> {
    try {
      const cluster = await clusterConn();
      const bucket = cluster.bucket(this.bucketName);

      let whereClause = "";
      const parameters: Record<string, any> = {};

      if (startDate || endDate) {
        const conditions = [];
        if (startDate) {
          conditions.push("timestamp >= $startDate");
          parameters.startDate = startDate;
        }
        if (endDate) {
          conditions.push("timestamp <= $endDate");
          parameters.endDate = endDate;
        }
        whereClause = `WHERE ${conditions.join(" AND ")}`;
      }

      const query = `
        SELECT 
          model,
          SUM(totalTokens) as totalTokens,
          SUM(estimatedCost) as totalCost,
          COUNT(*) as conversationCount,
          AVG(totalTokens) as averageTokensPerConversation,
          AVG(estimatedCost) as averageCostPerConversation,
          DATE_TRUNC_STR(timestamp, 'day') as period
        FROM \`${this.bucketName}\`.\`_default\`.\`${this.collectionName}\`
        ${whereClause}
        GROUP BY model, DATE_TRUNC_STR(timestamp, 'day')
        ORDER BY period DESC, model
      `;

      const result = await bucket.scope("_default").query(query, { parameters });
      const rows = await result.rows;

      log("📈 [UsageTracking] Retrieved system usage", {
        periodCount: rows.length,
        startDate,
        endDate,
      });

      return rows;
    } catch (error) {
      err("❌ [UsageTracking] Failed to retrieve system usage", {
        error: error.message,
      });
      throw error;
    }
  }

  async getTopUsers(limit: number = 10, period: string = "30d"): Promise<Array<{
    userId: string;
    totalTokens: number;
    totalCost: number;
    conversationCount: number;
  }>> {
    try {
      const cluster = await clusterConn();
      const bucket = cluster.bucket(this.bucketName);

      // Calculate start date based on period
      const startDate = new Date();
      if (period === "7d") {
        startDate.setDate(startDate.getDate() - 7);
      } else if (period === "30d") {
        startDate.setDate(startDate.getDate() - 30);
      } else if (period === "90d") {
        startDate.setDate(startDate.getDate() - 90);
      }

      const query = `
        SELECT 
          userId,
          SUM(totalTokens) as totalTokens,
          SUM(estimatedCost) as totalCost,
          COUNT(*) as conversationCount
        FROM \`${this.bucketName}\`.\`_default\`.\`${this.collectionName}\`
        WHERE timestamp >= $startDate AND userId IS NOT NULL
        GROUP BY userId
        ORDER BY totalCost DESC
        LIMIT ${limit}
      `;

      const result = await bucket.scope("_default").query(query, {
        parameters: { startDate: startDate.toISOString() }
      });
      const rows = await result.rows;

      log("📊 [UsageTracking] Retrieved top users", {
        userCount: rows.length,
        period,
        limit,
      });

      return rows;
    } catch (error) {
      err("❌ [UsageTracking] Failed to retrieve top users", {
        error: error.message,
        period,
        limit,
      });
      throw error;
    }
  }

  async cleanupOldUsage(retentionDays: number = 90): Promise<number> {
    try {
      const cluster = await clusterConn();
      const bucket = cluster.bucket(this.bucketName);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const query = `
        DELETE FROM \`${this.bucketName}\`.\`_default\`.\`${this.collectionName}\`
        WHERE timestamp < $cutoffDate
      `;

      const result = await bucket.scope("_default").query(query, {
        parameters: { cutoffDate: cutoffDate.toISOString() }
      });

      const deletedCount = result.meta?.metrics?.mutationCount || 0;

      log("🧹 [UsageTracking] Cleaned up old usage records", {
        deletedCount,
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
      });

      return deletedCount;
    } catch (error) {
      err("❌ [UsageTracking] Failed to cleanup old usage", {
        error: error.message,
        retentionDays,
      });
      throw error;
    }
  }

  static calculateCostFromTokens(
    inputTokens: number,
    outputTokens: number,
    model: string
  ): number {
    // Model-specific pricing
    const pricing = {
      "eu.amazon.nova-pro-v1:0": {
        inputTokensPerThousand: 0.0008,
        outputTokensPerThousand: 0.0032,
      },
      "anthropic.claude-3-5-sonnet-20241022-v2:0": {
        inputTokensPerThousand: 0.003,
        outputTokensPerThousand: 0.015,
      },
      "eu.anthropic.claude-3-7-sonnet-20250219-v1:0": {
        inputTokensPerThousand: 0.003,
        outputTokensPerThousand: 0.015,
      },
      "anthropic.claude-3-5-sonnet-20240620-v1:0": {
        inputTokensPerThousand: 0.003,
        outputTokensPerThousand: 0.015,
      },
      // Default fallback
      default: {
        inputTokensPerThousand: 0.0008,
        outputTokensPerThousand: 0.0032,
      }
    };

    const modelPricing = pricing[model] || pricing.default;
    const inputCost = (inputTokens / 1000) * modelPricing.inputTokensPerThousand;
    const outputCost = (outputTokens / 1000) * modelPricing.outputTokensPerThousand;
    
    return inputCost + outputCost;
  }
}

export const usageTracker = new UsageTrackingService();