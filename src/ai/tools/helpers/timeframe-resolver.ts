// src/ai/tools/helpers/timeframe-resolver.ts

export interface Timeframe {
  start_year: number;
  start_month: number;
  end_year: number;
  end_month: number;
}

export interface ResolvedTimeframe {
  startDate: string;
  endDate: string;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolveTimeframe(period?: string, timeframe?: Timeframe): ResolvedTimeframe {
  const now = new Date();

  // Explicit timeframe takes priority
  if (timeframe) {
    return {
      startDate: `${timeframe.start_year}-${String(timeframe.start_month).padStart(2, "0")}-01`,
      endDate: `${timeframe.end_year}-${String(timeframe.end_month).padStart(2, "0")}-01`,
    };
  }

  // Period-based resolution
  if (period) {
    const start = new Date(now);

    switch (period) {
      case "day":
        start.setDate(start.getDate() - 1);
        break;
      case "week":
        start.setDate(start.getDate() - 7);
        break;
      case "month":
        start.setMonth(start.getMonth() - 1);
        break;
      case "quarter":
        start.setMonth(start.getMonth() - 3);
        break;
      default: {
        // Handle numeric month patterns like "3m", "6m"
        const monthMatch = period.match(/^(\d+)m$/);
        if (monthMatch) {
          const months = parseInt(monthMatch[1], 10);
          start.setMonth(start.getMonth() - months);
        } else if (/^\d{4}-\d{2}$/.test(period)) {
          // Specific month (YYYY-MM)
          const [year, month] = period.split("-");
          const nextMonth = new Date(parseInt(year, 10), parseInt(month, 10), 1);
          return {
            startDate: `${period}-01`,
            endDate: formatDate(nextMonth),
          };
        } else {
          // Default: last 3 months
          start.setMonth(start.getMonth() - 3);
        }
      }
    }

    return { startDate: formatDate(start), endDate: formatDate(now) };
  }

  // Default: last 3 months
  const start = new Date(now);
  start.setMonth(start.getMonth() - 3);
  return { startDate: formatDate(start), endDate: formatDate(now) };
}

// Convert period to milliseconds for query filtering
export function periodToMilliseconds(period?: string): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  switch (period) {
    case "day":
      return MS_PER_DAY;
    case "week":
      return 7 * MS_PER_DAY;
    case "month":
      return 30 * MS_PER_DAY;
    case "quarter":
      return 90 * MS_PER_DAY;
    default:
      return 7 * MS_PER_DAY; // Default to week
  }
}
