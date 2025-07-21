/* src/tools/queryAnalysis/index.ts */

import getFatalRequests from './getFatalRequests';
import getLongestRunningQueries from './getLongestRunningQueries';
import getMostFrequentQueries from './getMostFrequentQueries';
import getLargestResultSizeQueries from './getLargestResultSizeQueries';
import getLargestResultCountQueries from './getLargestResultCountQueries';
import getPrimaryIndexQueries from './getPrimaryIndexQueries';
import getSystemIndexes from './getSystemIndexes';
import getCompletedRequests from './getCompletedRequests';
import getIndexesToDrop from './getIndexesToDrop';
import getMostExpensiveQueries from './getMostExpensiveQueries';
import getPreparedStatements from './getPreparedStatements';
import getDocumentTypeExamples from './getDocumentTypeExamples';
import analyzeDocumentStructure from './analyzeDocumentStructure';
import suggestQueryOptimizations from './suggestQueryOptimizations';
import getSystemNodes from './getSystemNodes';
import getSystemVitals from './getSystemVitals';
import getDetailedPreparedStatements from './getDetailedPreparedStatements';
import getDetailedIndexes from './getDetailedIndexes';

export {
  getFatalRequests,
  getLongestRunningQueries,
  getMostFrequentQueries,
  getLargestResultSizeQueries,
  getLargestResultCountQueries,
  getPrimaryIndexQueries,
  getSystemIndexes,
  getCompletedRequests,
  getIndexesToDrop,
  getMostExpensiveQueries,
  getPreparedStatements,
  getDocumentTypeExamples,
  analyzeDocumentStructure,
  suggestQueryOptimizations,
  getSystemNodes,
  getSystemVitals,
  getDetailedPreparedStatements,
  getDetailedIndexes
};

// Export all tools as a single object
export const queryAnalysisTools = {
  getFatalRequests,
  getLongestRunningQueries,
  getMostFrequentQueries,
  getLargestResultSizeQueries,
  getLargestResultCountQueries,
  getPrimaryIndexQueries,
  getSystemIndexes,
  getCompletedRequests,
  getIndexesToDrop,
  getMostExpensiveQueries,
  getPreparedStatements,
  getDocumentTypeExamples,
  analyzeDocumentStructure,
  suggestQueryOptimizations,
  getSystemNodes,
  getSystemVitals,
  getDetailedPreparedStatements,
  getDetailedIndexes
};

export default queryAnalysisTools;
