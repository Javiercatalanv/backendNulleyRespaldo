
export interface YearlyPublicationPoint {
  year: number;
  count: number;
}

export interface ResearcherYearlySeries {
  researcherId: string;
  fullName: string;
  points: YearlyPublicationPoint[];
}

/**
 * Result of the "what if X researcher wasn't there" analysis.
 *
*/

export interface CounterfactualImpact {
  researcherId: string;
  fullName: string;
  totalPublications: number;
  publicationsExclusiveToHim: number;
  publicationsCoAuthoredWithOtherUcn: number;
  citationsLost: number;
  quartileDistributionLost: {
    Q1: number;
    Q2: number;
    Q3: number;
    Q4: number;
    none: number;
  };
  yearlyImpactLost: Array<{
    year: number;
    publications: number;
    citations: number;
  }>;
  collaboratorsAffected: Array<{
    researcherId: string;
    fullName: string;
    sharedPapers: number;
  }>;
}
