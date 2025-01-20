// src/services/scoring.ts
import { persons, organizations } from '../database/schema';

interface ScoreResult {
  score: number;
  factors: Record<string, number>;
}

export function calculatePersonScore(person: typeof persons.$inferSelect): ScoreResult {
  const factors: Record<string, number> = {};

  // Profile Completeness (30%)
  factors.profileCompleteness =
    calculateProfileScore({
      name: person.name,
      firstName: person.firstName,
      lastName: person.lastName,
    }) * 0.3;

  // Enrichment Quality (25%)
  factors.enrichmentQuality = person.enrichmentData ? 0.25 : 0;

  // Activity Score (25%)
  factors.activityScore =
    calculateActivityScore({
      activityCount: person.activityCount,
      lastActivityAt: person.lastActivityAt,
      lastSeenAt: person.lastSeenAt,
    }) * 0.25;

  // Marketing Engagement (20%)
  factors.marketingScore =
    calculateMarketingScore({
      marketingStatus: person.marketingStatus,
      enrichmentStatus: person.enrichmentStatus,
    }) * 0.2;

  // Calculate final score (0-1)
  const finalScore = Object.values(factors).reduce((sum, score) => sum + score, 0);

  return {
    score: Math.min(Math.max(finalScore, 0), 1), // Ensure between 0-1
    factors,
  };
}

export function calculateOrganizationScore(org: typeof organizations.$inferSelect): ScoreResult {
  const factors: Record<string, number> = {};

  // Company Profile (30%)
  factors.profileScore =
    calculateOrgProfileScore({
      name: org.name,
      domain: org.domain,
      industry: org.industry,
      employeeCount: org.employeeCount,
    }) * 0.3;

  // Enrichment Data (25%)
  factors.enrichmentScore = org.enrichmentData ? 0.25 : 0;

  // Technology Stack (25%)
  factors.techScore = calculateTechScore(org.technologies) * 0.25;

  // Activity and Engagement (20%)
  factors.activityScore =
    calculateOrgActivityScore({
      lastActivityAt: org.lastActivityAt,
    }) * 0.2;

  // Calculate final score (0-1)
  const finalScore = Object.values(factors).reduce((sum, score) => sum + score, 0);

  return {
    score: Math.min(Math.max(finalScore, 0), 1),
    factors,
  };
}

export function determineEngagementLevel(score: number): string {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

// Helper functions
function calculateProfileScore(profile: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): number {
  const fields = [profile.name, profile.firstName, profile.lastName];
  const filledFields = fields.filter(Boolean).length;
  return filledFields / fields.length;
}

function calculateActivityScore(activity: {
  activityCount: number;
  lastActivityAt: Date | null;
  lastSeenAt: Date;
}): number {
  const now = new Date();
  const daysSinceLastActivity = activity.lastActivityAt
    ? Math.floor((now.getTime() - activity.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24))
    : Infinity;

  // More recent activity = higher score
  const recencyScore =
    daysSinceLastActivity < 7
      ? 1
      : daysSinceLastActivity < 30
        ? 0.7
        : daysSinceLastActivity < 90
          ? 0.4
          : 0.1;

  // More activities = higher score (cap at 10)
  const frequencyScore = Math.min(activity.activityCount / 10, 1);

  return (recencyScore + frequencyScore) / 2;
}

function calculateMarketingScore(marketing: {
  marketingStatus?: string | null;
  enrichmentStatus?: string | null;
}): number {
  if (marketing.marketingStatus === 'subscribed') return 1;
  if (marketing.marketingStatus === 'unsubscribed') return 0.3;
  if (marketing.enrichmentStatus === 'enriched') return 0.5;
  return 0.1;
}

function calculateOrgProfileScore(profile: {
  name: string;
  domain?: string | null;
  industry?: string | null;
  employeeCount?: number | null;
}): number {
  const fields = [profile.name, profile.domain, profile.industry, profile.employeeCount];
  const filledFields = fields.filter(Boolean).length;
  return filledFields / fields.length;
}

function calculateTechScore(technologies: Record<string, unknown> | null): number {
  if (!technologies) return 0;
  const techCount = Object.keys(technologies).length;
  return Math.min(techCount / 10, 1); // Cap at 10 technologies
}

function calculateOrgActivityScore(activity: { lastActivityAt: Date | null }): number {
  if (!activity.lastActivityAt) return 0;

  const now = new Date();
  const daysSinceLastActivity = Math.floor(
    (now.getTime() - activity.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24),
  );

  return daysSinceLastActivity < 7
    ? 1
    : daysSinceLastActivity < 30
      ? 0.7
      : daysSinceLastActivity < 90
        ? 0.4
        : 0.1;
}
