"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var perf_hooks_1 = require("perf_hooks");
var SUPABASE_URL = 'https://uzxrguviuaxdzggzlghq.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6eHJndXZpdWF4ZHpnZ3psZ2hxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNjI3Mzk5NCwiZXhwIjoyMDUxODQ5OTk0fQ.x9ARgtSbteW_NWte4KNxdn1s4fXVPb3jjcUacAnymYk';
function insertLog(logEntry) {
    return __awaiter(this, void 0, void 0, function () {
        var start, response, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    start = perf_hooks_1.performance.now();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, fetch("".concat(SUPABASE_URL, "/rest/v1/task_logs"), {
                            method: 'POST',
                            headers: {
                                'apikey': SUPABASE_KEY,
                                'Authorization': "Bearer ".concat(SUPABASE_KEY),
                                'Content-Type': 'application/json',
                                'Prefer': 'return=minimal'
                            },
                            body: JSON.stringify(logEntry)
                        })];
                case 2:
                    response = _a.sent();
                    if (!response.ok) {
                        throw new Error("HTTP error! status: ".concat(response.status));
                    }
                    return [2 /*return*/, {
                            duration: perf_hooks_1.performance.now() - start,
                            success: true
                        }];
                case 3:
                    error_1 = _a.sent();
                    return [2 /*return*/, {
                            duration: perf_hooks_1.performance.now() - start,
                            success: false,
                            error: error_1 instanceof Error ? error_1.message : String(error_1)
                        }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function generateTestLog(index) {
    var operations = ['download', 'process', 'upload', 'cleanup'];
    var operation = operations[index % operations.length];
    return {
        task: 'load-test-task',
        task_name: "test-operation-".concat(operation),
        status: 'completed',
        task_category: 'load_testing',
        message: "Test message ".concat(index),
        tenantid: 'test-tenant',
        projectid: 'test-project',
        userid: 'test-user',
        jobid: "test-job-".concat(Math.floor(index / 10)), // Group 10 operations under same job
        tags: ['load-test', operation],
        operation: operation,
        attributes: {
            test_index: index,
            timestamp: new Date().toISOString()
        }
    };
}
function calculateStats(results) {
    var successfulResults = results.filter(function (r) { return r.success; });
    var durations = successfulResults.map(function (r) { return r.duration; });
    var totalDuration = Math.max.apply(Math, results.map(function (r) { return r.duration; }));
    var minDuration = Math.min.apply(Math, durations);
    var maxDuration = Math.max.apply(Math, durations);
    var avgDuration = durations.reduce(function (a, b) { return a + b; }, 0) / durations.length;
    return {
        totalDuration: totalDuration,
        minDuration: minDuration,
        maxDuration: maxDuration,
        avgDuration: avgDuration,
        successCount: successfulResults.length,
        errorCount: results.length - successfulResults.length,
        requestsPerSecond: (results.length / totalDuration) * 1000
    };
}
function formatDuration(ms) {
    if (ms < 1000)
        return "".concat(ms.toFixed(2), "ms");
    return "".concat((ms / 1000).toFixed(2), "s");
}
function runLoadTest(count_1) {
    return __awaiter(this, arguments, void 0, function (count, concurrency) {
        var startTime, results, _loop_1, i, stats;
        if (concurrency === void 0) { concurrency = 10; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("Starting load test with ".concat(count, " requests (").concat(concurrency, " concurrent)..."));
                    startTime = perf_hooks_1.performance.now();
                    results = [];
                    _loop_1 = function (i) {
                        var batch, batchPromises, batchResults;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    batch = Array.from({ length: Math.min(concurrency, count - i) }, function (_, j) { return i + j; });
                                    batchPromises = batch.map(function (index) { return insertLog(generateTestLog(index)); });
                                    return [4 /*yield*/, Promise.all(batchPromises)];
                                case 1:
                                    batchResults = _b.sent();
                                    results.push.apply(results, batchResults);
                                    // Progress update every 10% or for each batch if count is small
                                    if (i % Math.max(Math.floor(count / 10), concurrency) === 0) {
                                        console.log("Progress: ".concat(Math.min(i + concurrency, count), "/").concat(count, " requests"));
                                    }
                                    return [2 /*return*/];
                            }
                        });
                    };
                    i = 0;
                    _a.label = 1;
                case 1:
                    if (!(i < count)) return [3 /*break*/, 4];
                    return [5 /*yield**/, _loop_1(i)];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3:
                    i += concurrency;
                    return [3 /*break*/, 1];
                case 4:
                    stats = calculateStats(results);
                    console.log('\nLoad Test Results:');
                    console.log('==================');
                    console.log("Total Duration: ".concat(formatDuration(stats.totalDuration)));
                    console.log("Min Response Time: ".concat(formatDuration(stats.minDuration)));
                    console.log("Max Response Time: ".concat(formatDuration(stats.maxDuration)));
                    console.log("Avg Response Time: ".concat(formatDuration(stats.avgDuration)));
                    console.log("Success Rate: ".concat(((stats.successCount / count) * 100).toFixed(2), "%"));
                    console.log("Requests/Second: ".concat(stats.requestsPerSecond.toFixed(2)));
                    if (stats.errorCount > 0) {
                        console.log('\nErrors:');
                        results
                            .filter(function (r) { return !r.success; })
                            .slice(0, 5) // Show only first 5 errors
                            .forEach(function (result, i) {
                            console.log("".concat(i + 1, ". ").concat(result.error));
                        });
                        if (stats.errorCount > 5) {
                            console.log("... and ".concat(stats.errorCount - 5, " more errors"));
                        }
                    }
                    return [2 /*return*/];
            }
        });
    });
}
// Run the load test
var REQUEST_COUNT = 1000;
var CONCURRENCY = 10;
runLoadTest(REQUEST_COUNT, CONCURRENCY).catch(console.error);
