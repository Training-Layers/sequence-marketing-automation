/**
 * Data Resolution Implementation
 * ===========================
 * Core implementation of data resolution functionality.
 */

import { z } from "zod";
import { DataResolutionConfig, ResolutionStrategy } from "../../schemas/data-resolution/config";
import { DataResolutionResult, ResolutionError, ResolutionMatch, ResolutionStatus } from "../../schemas/data-resolution/output";

// Helper type for resolution context
export interface ResolutionContext {
  config: DataResolutionConfig;
  startTime: number;
  attempts: number;
}

// Helper type for match result
export interface MatchResult {
  confidence: number;
  matchedFields: string[];
  recordId: string;
  recordType: "person" | "organization";
}

export class DataResolver {
  protected context: ResolutionContext;

  constructor(config: DataResolutionConfig) {
    this.context = {
      config,
      startTime: Date.now(),
      attempts: 0
    };
  }

  /**
   * Main resolution method
   */
  async resolve(sourceData: unknown): Promise<DataResolutionResult> {
    try {
      // 1. Validate input if configured
      if (this.context.config.validation?.validateBeforeResolution) {
        const isValid = await this.validateData(sourceData);
        if (!isValid) {
          return this.createErrorResult("Data validation failed", "VALIDATION_ERROR");
        }
      }

      // 2. Skip if already resolved and configured to skip
      if (this.context.config.options?.skipResolved && await this.isAlreadyResolved(sourceData)) {
        return this.createResult("skipped");
      }

      // 3. Apply resolution strategy
      const result = await this.applyStrategy(sourceData);
      return result;

    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : "Unknown error",
        "RESOLUTION_ERROR"
      );
    }
  }

  /**
   * Apply configured resolution strategy
   */
  private async applyStrategy(data: unknown): Promise<DataResolutionResult> {
    this.context.attempts++;
    const strategy = this.context.config.strategy;

    switch (strategy) {
      case "exact_match":
        return await this.resolveExactMatch(data);
      
      case "fuzzy_match":
        return await this.resolveFuzzyMatch(data);
      
      case "merge":
        return await this.resolveMerge(data);
      
      case "create_new":
        return await this.resolveCreateNew(data);
      
      default:
        return this.createErrorResult(
          `Unsupported strategy: ${strategy}`,
          "INVALID_STRATEGY"
        );
    }
  }

  /**
   * Exact matching resolution
   */
  private async resolveExactMatch(data: unknown): Promise<DataResolutionResult> {
    const matchResult = await this.findExactMatch(data);
    if (!matchResult) {
      if (this.context.config.options?.createMissing) {
        return await this.resolveCreateNew(data);
      }
      return this.createErrorResult("No exact match found", "NO_MATCH");
    }

    return this.createMatchResult(matchResult);
  }

  /**
   * Fuzzy matching resolution
   */
  private async resolveFuzzyMatch(data: unknown): Promise<DataResolutionResult> {
    const threshold = this.context.config.matching?.threshold ?? 0.8;
    const matchResult = await this.findFuzzyMatch(data, threshold);
    
    if (!matchResult) {
      if (this.context.config.options?.createMissing) {
        return await this.resolveCreateNew(data);
      }
      return this.createErrorResult("No fuzzy match found", "NO_MATCH");
    }

    return this.createMatchResult(matchResult);
  }

  /**
   * Merge resolution
   */
  private async resolveMerge(data: unknown): Promise<DataResolutionResult> {
    const matchResult = await this.findExactMatch(data);
    if (!matchResult) {
      return await this.resolveCreateNew(data);
    }

    const merged = await this.mergeRecords(matchResult.recordId, data);
    return this.createMatchResult({
      ...matchResult,
      recordId: merged.id
    });
  }

  /**
   * Create new record resolution
   */
  private async resolveCreateNew(data: unknown): Promise<DataResolutionResult> {
    const newRecord = await this.createRecord(data);
    return this.createMatchResult({
      confidence: 1,
      matchedFields: [],
      recordId: newRecord.id,
      recordType: newRecord.type
    });
  }

  /**
   * Create a successful match result
   */
  private createMatchResult(match: MatchResult): DataResolutionResult {
    return {
      status: "resolved" as ResolutionStatus,
      resolvedAt: new Date().toISOString(),
      match: {
        recordId: match.recordId,
        recordType: match.recordType,
        confidence: match.confidence,
        matchedFields: match.matchedFields,
        strategy: this.context.config.strategy
      },
      metadata: {
        attempts: this.context.attempts,
        processingTime: Date.now() - this.context.startTime,
        strategy: this.context.config.strategy
      }
    };
  }

  /**
   * Create an error result
   */
  private createErrorResult(message: string, code: string): DataResolutionResult {
    return {
      status: "failed" as ResolutionStatus,
      error: {
        message,
        code,
        timestamp: new Date().toISOString()
      },
      metadata: {
        attempts: this.context.attempts,
        processingTime: Date.now() - this.context.startTime,
        strategy: this.context.config.strategy
      }
    };
  }

  /**
   * Create a result with given status
   */
  private createResult(status: ResolutionStatus): DataResolutionResult {
    return {
      status,
      metadata: {
        attempts: this.context.attempts,
        processingTime: Date.now() - this.context.startTime,
        strategy: this.context.config.strategy
      }
    };
  }

  // Implementation-specific methods that need to be implemented
  protected async validateData(data: unknown): Promise<boolean> {
    throw new Error("Not implemented");
  }

  protected async isAlreadyResolved(data: unknown): Promise<boolean> {
    throw new Error("Not implemented");
  }

  protected async findExactMatch(data: unknown): Promise<MatchResult | null> {
    throw new Error("Not implemented");
  }

  protected async findFuzzyMatch(data: unknown, threshold: number): Promise<MatchResult | null> {
    throw new Error("Not implemented");
  }

  protected async mergeRecords(recordId: string, data: unknown): Promise<{ id: string }> {
    throw new Error("Not implemented");
  }

  protected async createRecord(data: unknown): Promise<{ id: string; type: "person" | "organization" }> {
    throw new Error("Not implemented");
  }
} 