#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESULTS_FILE = path.join(__dirname, '..', 'results.json');

function filterFailedTests() {
  try {
    // Read the original results file
    const rawData = fs.readFileSync(RESULTS_FILE, 'utf8');
    const results = JSON.parse(rawData);

    // Filter test results to only include test suites with failed tests
    const filteredTestResults = results.testResults
      .map(testSuite => {
        // Filter assertion results to only include failed tests
        const failedAssertions = testSuite.assertionResults.filter(
          test => test.status === 'failed'
        );

        // Return the test suite with only failed assertions, if any
        if (failedAssertions.length > 0) {
          return {
            ...testSuite,
            assertionResults: failedAssertions,
            status: 'failed' // Override suite status since it contains failed tests
          };
        }
        return null;
      })
      .filter(Boolean); // Remove null entries

    // Calculate new stats
    const totalFailedTests = filteredTestResults.reduce(
      (sum, suite) => sum + suite.assertionResults.length, 0
    );

    const failedTestSuites = filteredTestResults.length;

    // Create new filtered results object
    const filteredResults = {
      ...results,
      numTotalTestSuites: failedTestSuites,
      numPassedTestSuites: 0,
      numFailedTestSuites: failedTestSuites,
      numPendingTestSuites: 0,
      numTotalTests: totalFailedTests,
      numPassedTests: 0,
      numFailedTests: totalFailedTests,
      numPendingTests: 0,
      numTodoTests: 0,
      success: totalFailedTests === 0, // Success only if no failed tests
      testResults: filteredTestResults
    };

    // Write the filtered results back to the file
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(filteredResults, null, 2));

    console.log(`✅ Filtered results: ${totalFailedTests} failed tests from ${failedTestSuites} test suites`);

  } catch (error) {
    console.error('❌ Error filtering test results:', error.message);
    process.exit(1);
  }
}

// Run the filter
filterFailedTests();