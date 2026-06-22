import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { wrapOpenAI, wrapSDK } from "langsmith/wrappers";
import { jsonrepair } from "jsonrepair";
import {
  type ResponseSchema,
  SchemaType,
} from "@google/generative-ai";
import { DEFAULT_AI_PROVIDER, type AIProvider } from "@/lib/ai-provider";
import {
  generateGeminiTextWithFallback,
  type GeminiGenerationOptions,
  shouldRetryGeminiRequest,
} from "@/lib/gemini-router";
import {
  generateHuggingFaceTextWithFallback,
  type HuggingFaceGenerationOptions,
} from "@/lib/huggingface-router";
import {
  extractPriorityJobPhrases,
  extractKeywordCandidates,
  normalizeAnalyzedJobDescription,
  parseJobDescriptionSummary,
  type AnalyzedJobDescription,
} from "@/lib/job-description";
import { buildJobDescriptionAnalysisPrompt } from "@/lib/prompts/job-description-analysis";
import { buildResumeAnalysisPrompt } from "@/lib/prompts/resume-analysis";
import { buildResumeParsingPrompt } from "@/lib/prompts/resume-parsing";
import { buildResumeProfileExtractionPrompt } from "@/lib/prompts/resume-profile-extraction";
import {
  buildResumeSectionExtractionPrompt,
  type ResumeSectionExtractionContext,
} from "@/lib/prompts/resume-section-extraction";
import { buildResumeSummaryExtractionPrompt } from "@/lib/prompts/resume-summary-extraction";
import {
  buildHuggingFaceResumeTailoringUserMessage,
  buildResumeTailoringPrompt,
  getHuggingFaceResumeTailoringInstructions,
} from "@/lib/prompts/resume-tailoring";
import {
  createEmptyParsedResumeData,
  createEmptyResumeExtractionMeta,
  type ParsedResumeData,
  type ResumeEducation,
  type ResumeAnalysisReport,
  type ResumeExperience,
  type ResumePersonalInfo,
  type ResumeSectionExtractionMeta,
  type ResumeSectionKey,
  type ResumeExtractionMeta,
  normalizeAnalysisReport,
  normalizeResumeExtractionMeta,
  normalizeParsedResumeData,
  mergeParsedResumeData,
} from "@/lib/resume";
import {
  analyzeResumeFallback,
  auditResumeExtraction,
  extractLocalSkillsCandidate,
  extractResumeStructureContext,
  parseResumeFallback,
  type ResumeExtractionAudit,
} from "@/lib/resume-processing";
import { stripSkillGroupPrefix } from "@/lib/resume-skills";
import {
  classifyTechnicalSkillGroup,
  isTechnicalSkill,
  sanitizeTechnicalSkills,
  technicalSkillKey,
} from "@/lib/technical-skills";

const OPENAI_MODEL = "gpt-5.4";
// Anthropic extraction model. Defaults to the latest Opus; override with ANTHROPIC_MODEL.
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-4-8";
const ANTHROPIC_MAX_ATTEMPTS = 2;
const SECTION_AI_TIMEOUT_MS = 45_000;
const AI_PROVIDER_REQUEST_TIMEOUT_MS = 120_000;
const HUGGINGFACE_CONTEXT_WINDOW_TOKENS = 16384;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
const HUGGINGFACE_MAX_OUTPUT_TOKENS = 16384;
const HUGGINGFACE_CONTEXT_BUFFER_TOKENS = 512;
const HUGGINGFACE_MIN_OUTPUT_TOKENS = 1200;
const HUGGINGFACE_APPROX_CHARS_PER_TOKEN = 3;
const MAX_RESUME_PROMPT_CHARS = 42000;
const MAX_ASSISTANT_PROMPT_CHARS = 14000;
const GEMINI_MAX_ATTEMPTS = 2;
const OPENAI_MAX_ATTEMPTS = 2;
const HUGGINGFACE_MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 350;
const RESUME_PARSE_OUTPUT_TOKENS = 18000;
// For Hugging Face document-processing calls, request the provider ceiling and let
// the context-fit helpers trim only when the prompt would overflow the window.
const HUGGINGFACE_RESUME_PARSE_OUTPUT_TOKENS =
  HUGGINGFACE_MAX_OUTPUT_TOKENS;
const RESUME_ANALYSIS_OUTPUT_TOKENS = 10000;
const TAILORED_RESUME_OUTPUT_TOKENS = 16000;
const HUGGINGFACE_TAILORED_RESUME_OUTPUT_TOKENS =
  HUGGINGFACE_MAX_OUTPUT_TOKENS;

type GeminiCallOptions = GeminiGenerationOptions;

export type AIExecutionOptions = {
  geminiRouterIndex?: number;
  huggingFaceRouterIndex?: number;
};

type OpenAIResponseFormat = {
  type: "json_schema";
  name: string;
  strict: true;
  schema: Record<string, unknown>;
  description?: string;
};

type OpenAICallOptions = {
  maxOutputTokens?: number;
  temperature?: number;
  text?: {
    format?: OpenAIResponseFormat;
    verbosity?: "low" | "medium" | "high";
  };
  // Stream the Responses API and aggregate token deltas. Lowers time-to-first-token
  // and avoids HTTP timeouts on large structured outputs, which speeds up the
  // step-by-step section extraction.
  stream?: boolean;
};

type HuggingFaceCallOptions = Pick<
  OpenAICallOptions,
  "maxOutputTokens" | "temperature"
> & {
  preferredRouterIndex?: number;
};

const parsedResumeSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    personalInfo: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING },
        title: { type: SchemaType.STRING },
        email: { type: SchemaType.STRING },
        phone: { type: SchemaType.STRING },
        location: { type: SchemaType.STRING },
        links: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              type: { type: SchemaType.STRING },
              label: { type: SchemaType.STRING },
              url: { type: SchemaType.STRING },
            },
            required: ["type", "label", "url"],
          },
        },
      },
      required: ["name", "title", "email", "phone", "location", "links"],
    },
    summary: { type: SchemaType.STRING },
    skills: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    experience: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          company: { type: SchemaType.STRING },
          location: { type: SchemaType.STRING },
          startDate: { type: SchemaType.STRING },
          endDate: { type: SchemaType.STRING },
          description: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
        },
        required: [
          "title",
          "company",
          "location",
          "startDate",
          "endDate",
          "description",
        ],
      },
    },
    education: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          degree: { type: SchemaType.STRING },
          institution: { type: SchemaType.STRING },
          year: { type: SchemaType.STRING },
        },
        required: ["degree", "institution", "year"],
      },
    },
  },
  required: ["personalInfo", "summary", "skills", "experience", "education"],
};

const analysisReportSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    score: { type: SchemaType.NUMBER },
    missingKeywords: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    tips: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    sectionCompleteness: {
      type: SchemaType.OBJECT,
      properties: {
        personalInfo: { type: SchemaType.BOOLEAN },
        summary: { type: SchemaType.BOOLEAN },
        skills: { type: SchemaType.BOOLEAN },
        experience: { type: SchemaType.BOOLEAN },
        education: { type: SchemaType.BOOLEAN },
      },
      required: [
        "personalInfo",
        "summary",
        "skills",
        "experience",
        "education",
      ],
    },
    readabilityScore: { type: SchemaType.NUMBER },
  },
  required: [
    "score",
    "missingKeywords",
    "tips",
    "sectionCompleteness",
    "readabilityScore",
  ],
};

const analyzedJobDescriptionSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    roleTitle: { type: SchemaType.STRING },
    companyName: { type: SchemaType.STRING },
    department: { type: SchemaType.STRING },
    roleType: { type: SchemaType.STRING },
    employmentType: { type: SchemaType.STRING },
    seniorityLevel: { type: SchemaType.STRING },
    industry: { type: SchemaType.STRING },
    companyStage: { type: SchemaType.STRING },
    companySignals: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    coreHiringProblem: { type: SchemaType.STRING },
    mission: { type: SchemaType.STRING },
    responsibilities: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    coreResponsibilities: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    requiredSkills: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    preferredSkills: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    inferredSkills: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    technicalSkills: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    softSkills: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    operationalSkills: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    leadershipSignals: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    executionSignals: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    collaborationSignals: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    technicalEnvironment: {
      type: SchemaType.OBJECT,
      properties: {
        languages: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        frameworks: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        cloud: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        databases: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        infrastructure: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        tools: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        methodologies: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      },
      required: ["languages", "frameworks", "cloud", "databases", "infrastructure", "tools", "methodologies"],
    },
    domainAnalysis: {
      type: SchemaType.OBJECT,
      properties: {
        industryDomain: { type: SchemaType.STRING },
        domainComplexity: { type: SchemaType.STRING },
        regulatorySignals: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        safetyCriticalSignals: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        engineeringMaturity: { type: SchemaType.STRING },
      },
      required: ["industryDomain", "domainComplexity", "regulatorySignals", "safetyCriticalSignals", "engineeringMaturity"],
    },
    atsAnalysis: {
      type: SchemaType.OBJECT,
      properties: {
        atsKeywords: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        priorityKeywords: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        aboveTheFoldPriorities: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        resumeBulletKeywords: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        recruiterScanTerms: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      },
      required: ["atsKeywords", "priorityKeywords", "aboveTheFoldPriorities", "resumeBulletKeywords", "recruiterScanTerms"],
    },
    cultureAnalysis: {
      type: SchemaType.OBJECT,
      properties: {
        ownershipLevel: { type: SchemaType.STRING },
        communicationStyle: { type: SchemaType.STRING },
        executionPace: { type: SchemaType.STRING },
        autonomyExpectation: { type: SchemaType.STRING },
        growthMindsetExpectation: { type: SchemaType.STRING },
        ambiguityTolerance: { type: SchemaType.STRING },
      },
      required: ["ownershipLevel", "communicationStyle", "executionPace", "autonomyExpectation", "growthMindsetExpectation", "ambiguityTolerance"],
    },
    resumeTailoringGuidance: {
      type: SchemaType.OBJECT,
      properties: {
        emphasizeExperience: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        emphasizeAchievements: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        preferredResumeTone: { type: SchemaType.STRING },
        recommendedBulletStyle: { type: SchemaType.STRING },
        deprioritize: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      },
      required: ["emphasizeExperience", "emphasizeAchievements", "preferredResumeTone", "recommendedBulletStyle", "deprioritize"],
    },
    keywordPriorities: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    warnings: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
  },
  required: [
    "roleTitle",
    "companyName",
    "department",
    "roleType",
    "employmentType",
    "seniorityLevel",
    "industry",
    "companyStage",
    "companySignals",
    "coreHiringProblem",
    "mission",
    "responsibilities",
    "coreResponsibilities",
    "requiredSkills",
    "preferredSkills",
    "inferredSkills",
    "technicalSkills",
    "softSkills",
    "operationalSkills",
    "leadershipSignals",
    "executionSignals",
    "collaborationSignals",
    "technicalEnvironment",
    "domainAnalysis",
    "atsAnalysis",
    "cultureAnalysis",
    "resumeTailoringGuidance",
    "keywordPriorities",
    "warnings",
  ],
};

type SequentialResumeExtractionResult = {
  parsedData: ParsedResumeData;
  extractionMeta: ResumeExtractionMeta;
  extractionAudit: ResumeExtractionAudit;
};

type SequentialExtractionHooks = {
  onBeforeSection?: (section: ResumeSectionKey) => void | Promise<void>;
  onAfterSection?: (
    section: ResumeSectionKey,
    meta: ResumeSectionExtractionMeta,
  ) => void | Promise<void>;
};

type SectionResultMap = {
  personalInfo: ResumePersonalInfo;
  summary: string;
  skills: string[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
};

const profileSectionSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    personalInfo: parsedResumeSchema.properties!.personalInfo,
  },
  required: ["personalInfo"],
};

const summarySectionSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING },
  },
  required: ["summary"],
};

const skillsSectionSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    skills: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  },
  required: ["skills"],
};

const experienceSectionSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    experience: parsedResumeSchema.properties!.experience,
  },
  required: ["experience"],
};

const educationSectionSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    education: parsedResumeSchema.properties!.education,
  },
  required: ["education"],
};

const tailoringProfileSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    fullName: { type: SchemaType.STRING },
    roleTitle: { type: SchemaType.STRING },
    email: { type: SchemaType.STRING },
    phone: { type: SchemaType.STRING },
    location: { type: SchemaType.STRING },
    linkedin: { type: SchemaType.STRING },
    github: { type: SchemaType.STRING },
    portfolio: { type: SchemaType.STRING },
    website: { type: SchemaType.STRING },
    otherLinks: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  },
  required: [
    "fullName",
    "roleTitle",
    "email",
    "phone",
    "location",
    "linkedin",
    "github",
    "portfolio",
    "website",
    "otherLinks",
  ],
};

const tailoringSkillGroupSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    label: { type: SchemaType.STRING },
    items: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  },
  required: ["label", "items"],
};

const tailoringWorkExperienceSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    sourceIndex: { type: SchemaType.NUMBER },
    company: { type: SchemaType.STRING },
    originalRoleTitle: { type: SchemaType.STRING },
    tailoredRoleTitle: { type: SchemaType.STRING },
    location: { type: SchemaType.STRING },
    startDate: { type: SchemaType.STRING },
    endDate: { type: SchemaType.STRING },
    bullets: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  },
  required: [
    "sourceIndex",
    "company",
    "originalRoleTitle",
    "tailoredRoleTitle",
    "location",
    "startDate",
    "endDate",
    "bullets",
  ],
};

const tailoringProjectSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    name: { type: SchemaType.STRING },
    description: { type: SchemaType.STRING },
    technologies: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    bullets: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  },
  required: ["name", "description", "technologies", "bullets"],
};

const tailoringEducationSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    school: { type: SchemaType.STRING },
    degree: { type: SchemaType.STRING },
    field: { type: SchemaType.STRING },
    location: { type: SchemaType.STRING },
    startDate: { type: SchemaType.STRING },
    endDate: { type: SchemaType.STRING },
    details: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  },
  required: [
    "school",
    "degree",
    "field",
    "location",
    "startDate",
    "endDate",
    "details",
  ],
};

const tailoringMappingCheckSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    sourceIndex: { type: SchemaType.NUMBER },
    originalCompany: { type: SchemaType.STRING },
    tailoredCompany: { type: SchemaType.STRING },
    companyPreserved: { type: SchemaType.BOOLEAN },
    datesPreserved: { type: SchemaType.BOOLEAN },
    roleTailored: { type: SchemaType.BOOLEAN },
    bulletCount: { type: SchemaType.NUMBER },
  },
  required: [
    "sourceIndex",
    "originalCompany",
    "tailoredCompany",
    "companyPreserved",
    "datesPreserved",
    "roleTailored",
    "bulletCount",
  ],
};

const tailoredResumeSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    profile: tailoringProfileSchema,
    summary: { type: SchemaType.STRING },
    skills: {
      type: SchemaType.ARRAY,
      items: tailoringSkillGroupSchema,
    },
    workExperience: {
      type: SchemaType.ARRAY,
      items: tailoringWorkExperienceSchema,
    },
    projects: {
      type: SchemaType.ARRAY,
      items: tailoringProjectSchema,
    },
    education: {
      type: SchemaType.ARRAY,
      items: tailoringEducationSchema,
    },
    certifications: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    tailoringNotes: {
      type: SchemaType.OBJECT,
      properties: {
        targetRole: { type: SchemaType.STRING },
        jobFocus: { type: SchemaType.STRING },
        candidateAngle: { type: SchemaType.STRING },
        topRequiredSkills: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        topPreferredSkills: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        technicalSkillPlan: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        experienceKeywordPlan: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        atsKeywordsPlaced: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        skillsAddedFromJobDescription: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        skillsRemovedAsLessRelevant: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        experienceMappingCheck: {
          type: SchemaType.ARRAY,
          items: tailoringMappingCheckSchema,
        },
        warnings: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
      },
      required: [
        "targetRole",
        "jobFocus",
        "candidateAngle",
        "topRequiredSkills",
        "topPreferredSkills",
        "technicalSkillPlan",
        "experienceKeywordPlan",
        "atsKeywordsPlaced",
        "skillsAddedFromJobDescription",
        "skillsRemovedAsLessRelevant",
        "experienceMappingCheck",
        "warnings",
      ],
    },
  },
  required: [
    "profile",
    "summary",
    "skills",
    "workExperience",
    "projects",
    "education",
    "certifications",
    "tailoringNotes",
  ],
};

const parsedResumeJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    personalInfo: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        title: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        location: { type: "string" },
        links: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: {
                type: "string",
                enum: [
                  "linkedin",
                  "github",
                  "gitlab",
                  "bitbucket",
                  "portfolio",
                  "website",
                  "other",
                ],
              },
              label: { type: "string" },
              url: { type: "string" },
            },
            required: ["type", "label", "url"],
          },
        },
      },
      required: ["name", "title", "email", "phone", "location", "links"],
    },
    summary: { type: "string" },
    skills: {
      type: "array",
      items: { type: "string" },
    },
    experience: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          company: { type: "string" },
          location: { type: "string" },
          startDate: { type: "string" },
          endDate: { type: "string" },
          description: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: [
          "title",
          "company",
          "location",
          "startDate",
          "endDate",
          "description",
        ],
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          degree: { type: "string" },
          institution: { type: "string" },
          year: { type: "string" },
        },
        required: ["degree", "institution", "year"],
      },
    },
  },
  required: ["personalInfo", "summary", "skills", "experience", "education"],
} as const satisfies Record<string, unknown>;


const analysisReportJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "number" },
    missingKeywords: {
      type: "array",
      items: { type: "string" },
    },
    tips: {
      type: "array",
      items: { type: "string" },
    },
    sectionCompleteness: {
      type: "object",
      additionalProperties: false,
      properties: {
        personalInfo: { type: "boolean" },
        summary: { type: "boolean" },
        skills: { type: "boolean" },
        experience: { type: "boolean" },
        education: { type: "boolean" },
      },
      required: [
        "personalInfo",
        "summary",
        "skills",
        "experience",
        "education",
      ],
    },
    readabilityScore: { type: "number" },
  },
  required: [
    "score",
    "missingKeywords",
    "tips",
    "sectionCompleteness",
    "readabilityScore",
  ],
} as const satisfies Record<string, unknown>;

const profileSectionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    personalInfo: parsedResumeJsonSchema.properties.personalInfo,
  },
  required: ["personalInfo"],
} as const satisfies Record<string, unknown>;

const summarySectionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
  },
  required: ["summary"],
} as const satisfies Record<string, unknown>;

const skillsSectionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    skills: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["skills"],
} as const satisfies Record<string, unknown>;

const experienceSectionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    experience: parsedResumeJsonSchema.properties.experience,
  },
  required: ["experience"],
} as const satisfies Record<string, unknown>;

const educationSectionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    education: parsedResumeJsonSchema.properties.education,
  },
  required: ["education"],
} as const satisfies Record<string, unknown>;

const tailoringProfileJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    fullName: { type: "string" },
    roleTitle: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    location: { type: "string" },
    linkedin: { type: "string" },
    github: { type: "string" },
    portfolio: { type: "string" },
    website: { type: "string" },
    otherLinks: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "fullName",
    "roleTitle",
    "email",
    "phone",
    "location",
    "linkedin",
    "github",
    "portfolio",
    "website",
    "otherLinks",
  ],
} as const satisfies Record<string, unknown>;

const tailoringSkillGroupJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: { type: "string" },
    items: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["label", "items"],
} as const satisfies Record<string, unknown>;

const tailoringWorkExperienceJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    sourceIndex: { type: "number" },
    company: { type: "string" },
    originalRoleTitle: { type: "string" },
    tailoredRoleTitle: { type: "string" },
    location: { type: "string" },
    startDate: { type: "string" },
    endDate: { type: "string" },
    bullets: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "sourceIndex",
    "company",
    "originalRoleTitle",
    "tailoredRoleTitle",
    "location",
    "startDate",
    "endDate",
    "bullets",
  ],
} as const satisfies Record<string, unknown>;

const tailoringProjectJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    technologies: {
      type: "array",
      items: { type: "string" },
    },
    bullets: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["name", "description", "technologies", "bullets"],
} as const satisfies Record<string, unknown>;

const tailoringEducationJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    school: { type: "string" },
    degree: { type: "string" },
    field: { type: "string" },
    location: { type: "string" },
    startDate: { type: "string" },
    endDate: { type: "string" },
    details: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "school",
    "degree",
    "field",
    "location",
    "startDate",
    "endDate",
    "details",
  ],
} as const satisfies Record<string, unknown>;

const tailoringMappingCheckJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    sourceIndex: { type: "number" },
    originalCompany: { type: "string" },
    tailoredCompany: { type: "string" },
    companyPreserved: { type: "boolean" },
    datesPreserved: { type: "boolean" },
    roleTailored: { type: "boolean" },
    bulletCount: { type: "number" },
  },
  required: [
    "sourceIndex",
    "originalCompany",
    "tailoredCompany",
    "companyPreserved",
    "datesPreserved",
    "roleTailored",
    "bulletCount",
  ],
} as const satisfies Record<string, unknown>;

const tailoredResumeJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    profile: tailoringProfileJsonSchema,
    summary: { type: "string" },
    skills: {
      type: "array",
      items: tailoringSkillGroupJsonSchema,
    },
    workExperience: {
      type: "array",
      items: tailoringWorkExperienceJsonSchema,
    },
    projects: {
      type: "array",
      items: tailoringProjectJsonSchema,
    },
    education: {
      type: "array",
      items: tailoringEducationJsonSchema,
    },
    certifications: {
      type: "array",
      items: { type: "string" },
    },
    tailoringNotes: {
      type: "object",
      additionalProperties: false,
      properties: {
        targetRole: { type: "string" },
        jobFocus: { type: "string" },
        candidateAngle: { type: "string" },
        topRequiredSkills: {
          type: "array",
          items: { type: "string" },
        },
        topPreferredSkills: {
          type: "array",
          items: { type: "string" },
        },
        technicalSkillPlan: {
          type: "array",
          items: { type: "string" },
        },
        experienceKeywordPlan: {
          type: "array",
          items: { type: "string" },
        },
        atsKeywordsPlaced: {
          type: "array",
          items: { type: "string" },
        },
        skillsAddedFromJobDescription: {
          type: "array",
          items: { type: "string" },
        },
        skillsRemovedAsLessRelevant: {
          type: "array",
          items: { type: "string" },
        },
        experienceMappingCheck: {
          type: "array",
          items: tailoringMappingCheckJsonSchema,
        },
        warnings: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: [
        "targetRole",
        "jobFocus",
        "candidateAngle",
        "topRequiredSkills",
        "topPreferredSkills",
        "technicalSkillPlan",
        "experienceKeywordPlan",
        "atsKeywordsPlaced",
        "skillsAddedFromJobDescription",
        "skillsRemovedAsLessRelevant",
        "experienceMappingCheck",
        "warnings",
      ],
    },
  },
  required: [
    "profile",
    "summary",
    "skills",
    "workExperience",
    "projects",
    "education",
    "certifications",
    "tailoringNotes",
  ],
} as const satisfies Record<string, unknown>;

const analyzedJobDescriptionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    roleTitle: { type: "string" },
    companyName: { type: "string" },
    department: { type: "string" },
    roleType: { type: "string" },
    employmentType: { type: "string" },
    seniorityLevel: { type: "string" },
    industry: { type: "string" },
    companyStage: { type: "string" },
    companySignals: { type: "array", items: { type: "string" } },
    coreHiringProblem: { type: "string" },
    mission: { type: "string" },
    responsibilities: { type: "array", items: { type: "string" } },
    coreResponsibilities: { type: "array", items: { type: "string" } },
    requiredSkills: { type: "array", items: { type: "string" } },
    preferredSkills: { type: "array", items: { type: "string" } },
    inferredSkills: { type: "array", items: { type: "string" } },
    technicalSkills: { type: "array", items: { type: "string" } },
    softSkills: { type: "array", items: { type: "string" } },
    operationalSkills: { type: "array", items: { type: "string" } },
    leadershipSignals: { type: "array", items: { type: "string" } },
    executionSignals: { type: "array", items: { type: "string" } },
    collaborationSignals: { type: "array", items: { type: "string" } },
    technicalEnvironment: {
      type: "object",
      additionalProperties: false,
      properties: {
        languages: { type: "array", items: { type: "string" } },
        frameworks: { type: "array", items: { type: "string" } },
        cloud: { type: "array", items: { type: "string" } },
        databases: { type: "array", items: { type: "string" } },
        infrastructure: { type: "array", items: { type: "string" } },
        tools: { type: "array", items: { type: "string" } },
        methodologies: { type: "array", items: { type: "string" } },
      },
      required: ["languages", "frameworks", "cloud", "databases", "infrastructure", "tools", "methodologies"],
    },
    domainAnalysis: {
      type: "object",
      additionalProperties: false,
      properties: {
        industryDomain: { type: "string" },
        domainComplexity: { type: "string" },
        regulatorySignals: { type: "array", items: { type: "string" } },
        safetyCriticalSignals: { type: "array", items: { type: "string" } },
        engineeringMaturity: { type: "string" },
      },
      required: ["industryDomain", "domainComplexity", "regulatorySignals", "safetyCriticalSignals", "engineeringMaturity"],
    },
    atsAnalysis: {
      type: "object",
      additionalProperties: false,
      properties: {
        atsKeywords: { type: "array", items: { type: "string" } },
        priorityKeywords: { type: "array", items: { type: "string" } },
        aboveTheFoldPriorities: { type: "array", items: { type: "string" } },
        resumeBulletKeywords: { type: "array", items: { type: "string" } },
        recruiterScanTerms: { type: "array", items: { type: "string" } },
      },
      required: ["atsKeywords", "priorityKeywords", "aboveTheFoldPriorities", "resumeBulletKeywords", "recruiterScanTerms"],
    },
    cultureAnalysis: {
      type: "object",
      additionalProperties: false,
      properties: {
        ownershipLevel: { type: "string" },
        communicationStyle: { type: "string" },
        executionPace: { type: "string" },
        autonomyExpectation: { type: "string" },
        growthMindsetExpectation: { type: "string" },
        ambiguityTolerance: { type: "string" },
      },
      required: ["ownershipLevel", "communicationStyle", "executionPace", "autonomyExpectation", "growthMindsetExpectation", "ambiguityTolerance"],
    },
    resumeTailoringGuidance: {
      type: "object",
      additionalProperties: false,
      properties: {
        emphasizeExperience: { type: "array", items: { type: "string" } },
        emphasizeAchievements: { type: "array", items: { type: "string" } },
        preferredResumeTone: { type: "string" },
        recommendedBulletStyle: { type: "string" },
        deprioritize: { type: "array", items: { type: "string" } },
      },
      required: ["emphasizeExperience", "emphasizeAchievements", "preferredResumeTone", "recommendedBulletStyle", "deprioritize"],
    },
    keywordPriorities: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: [
    "roleTitle",
    "companyName",
    "department",
    "roleType",
    "employmentType",
    "seniorityLevel",
    "industry",
    "companyStage",
    "companySignals",
    "coreHiringProblem",
    "mission",
    "responsibilities",
    "coreResponsibilities",
    "requiredSkills",
    "preferredSkills",
    "inferredSkills",
    "technicalSkills",
    "softSkills",
    "operationalSkills",
    "leadershipSignals",
    "executionSignals",
    "collaborationSignals",
    "technicalEnvironment",
    "domainAnalysis",
    "atsAnalysis",
    "cultureAnalysis",
    "resumeTailoringGuidance",
    "keywordPriorities",
    "warnings",
  ],
} as const satisfies Record<string, unknown>;

// LangSmith observability: wrapOpenAI / wrapSDK trace every request when
// LANGSMITH_TRACING=true and LANGSMITH_API_KEY are set, and are transparent
// no-ops otherwise. Clients are wrapped once and reused.
let openAIClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  if (!openAIClient) {
    openAIClient = wrapOpenAI(
      new OpenAI({ apiKey, timeout: AI_PROVIDER_REQUEST_TIMEOUT_MS }),
    );
  }

  return openAIClient;
}

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }

  if (!anthropicClient) {
    anthropicClient = wrapSDK(
      new Anthropic({ apiKey, timeout: AI_PROVIDER_REQUEST_TIMEOUT_MS }),
    );
  }

  return anthropicClient;
}

function clipResumeText(rawText: string) {
  return rawText.trim().slice(0, MAX_RESUME_PROMPT_CHARS);
}

function estimateHuggingFaceTokens(text: string) {
  return Math.ceil(text.length / HUGGINGFACE_APPROX_CHARS_PER_TOKEN);
}

function clipTextByApproxTokenBudget(text: string, tokenBudget: number) {
  const maxChars = Math.max(
    0,
    tokenBudget * HUGGINGFACE_APPROX_CHARS_PER_TOKEN,
  );

  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

function fitHuggingFacePrompt(prompt: string, requestedOutputTokens: number) {
  const requestedCompletion = Math.min(
    Math.max(1, requestedOutputTokens),
    HUGGINGFACE_MAX_OUTPUT_TOKENS,
  );

  let fittedPrompt = prompt;
  let estimatedPromptTokens = estimateHuggingFaceTokens(fittedPrompt);
  let availableCompletion =
    HUGGINGFACE_CONTEXT_WINDOW_TOKENS -
    estimatedPromptTokens -
    HUGGINGFACE_CONTEXT_BUFFER_TOKENS;

  if (availableCompletion < HUGGINGFACE_MIN_OUTPUT_TOKENS) {
    const targetPromptTokens =
      HUGGINGFACE_CONTEXT_WINDOW_TOKENS -
      HUGGINGFACE_MIN_OUTPUT_TOKENS -
      HUGGINGFACE_CONTEXT_BUFFER_TOKENS;

    fittedPrompt = clipTextByApproxTokenBudget(prompt, targetPromptTokens);
    estimatedPromptTokens = estimateHuggingFaceTokens(fittedPrompt);
    availableCompletion =
      HUGGINGFACE_CONTEXT_WINDOW_TOKENS -
      estimatedPromptTokens -
      HUGGINGFACE_CONTEXT_BUFFER_TOKENS;
  }

  return {
    prompt: fittedPrompt,
    maxOutputTokens: Math.max(
      1,
      Math.min(
        requestedCompletion,
        availableCompletion,
        HUGGINGFACE_MAX_OUTPUT_TOKENS,
      ),
    ),
  };
}

/**
 * Fits a system + user message pair into the HuggingFace context window.
 * System-message tokens are accounted for separately so the user content
 * (the resume text) gets as much space as possible.
 */
function fitHuggingFaceMessages(
  systemMessage: string,
  userContent: string,
  requestedOutputTokens: number,
) {
  const systemTokens = estimateHuggingFaceTokens(systemMessage);
  const requestedCompletion = Math.min(
    Math.max(1, requestedOutputTokens),
    HUGGINGFACE_MAX_OUTPUT_TOKENS,
  );

  let clippedUser = userContent;
  let userTokens = estimateHuggingFaceTokens(clippedUser);
  const availableCompletion =
    HUGGINGFACE_CONTEXT_WINDOW_TOKENS -
    systemTokens -
    userTokens -
    HUGGINGFACE_CONTEXT_BUFFER_TOKENS;

  if (availableCompletion < HUGGINGFACE_MIN_OUTPUT_TOKENS) {
    const targetUserTokens =
      HUGGINGFACE_CONTEXT_WINDOW_TOKENS -
      systemTokens -
      HUGGINGFACE_MIN_OUTPUT_TOKENS -
      HUGGINGFACE_CONTEXT_BUFFER_TOKENS;

    clippedUser =
      targetUserTokens > 0
        ? clipTextByApproxTokenBudget(userContent, targetUserTokens)
        : userContent.slice(0, 300);

    userTokens = estimateHuggingFaceTokens(clippedUser);
  }

  const finalAvailableCompletion =
    HUGGINGFACE_CONTEXT_WINDOW_TOKENS -
    systemTokens -
    userTokens -
    HUGGINGFACE_CONTEXT_BUFFER_TOKENS;

  return {
    messages: [
      { role: "system" as const, content: systemMessage },
      { role: "user" as const, content: clippedUser },
    ],
    maxOutputTokens: Math.max(
      HUGGINGFACE_MIN_OUTPUT_TOKENS,
      Math.min(
        requestedCompletion,
        finalAvailableCompletion,
        HUGGINGFACE_MAX_OUTPUT_TOKENS,
      ),
    ),
  };
}

function stripMarkdownFences(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function applyCommonHuggingFaceJsonFixes(text: string) {
  return text
    .replace(/\}\},(\s*\{"title":)/g, "},$1")
    .replace(/\}\},(\s*\{"degree":)/g, "},$1")
    .replace(/\}\},(\s*\{"type":)/g, "},$1")
    .replace(/\]\}\},(\s*\{"title":)/g, "]},$1");
}

function collectBalancedJsonObjects(text: string) {
  const objects: string[] = [];

  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") {
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }

        if (char === "\\") {
          escaped = true;
          continue;
        }

        if (char === "\"") {
          inString = false;
        }

        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth += 1;
        continue;
      }

      if (char === "}") {
        depth -= 1;

        if (depth === 0) {
          objects.push(text.slice(start, index + 1));
          break;
        }
      }
    }
  }

  return objects;
}

function tryParseJsonCandidate<T>(candidate: string) {
  try {
    return JSON.parse(candidate) as T;
  } catch {
    try {
      return JSON.parse(jsonrepair(candidate)) as T;
    } catch {
      const heuristicallyFixed = applyCommonHuggingFaceJsonFixes(candidate);

      try {
        return JSON.parse(heuristicallyFixed) as T;
      } catch {
        return JSON.parse(jsonrepair(heuristicallyFixed)) as T;
      }
    }
  }
}

function extractJsonFromText<T>(text: string) {
  const cleanedText = stripMarkdownFences(text);
  const heuristicallyFixedText = applyCommonHuggingFaceJsonFixes(cleanedText);

  try {
    return JSON.parse(heuristicallyFixedText) as T;
  } catch {
    // continue into recovery below
  }

  try {
    return JSON.parse(jsonrepair(heuristicallyFixedText)) as T;
  } catch {
    // continue into candidate recovery below
  }

  const candidates = collectBalancedJsonObjects(heuristicallyFixedText).sort(
    (left, right) => right.length - left.length,
  );

  for (const candidate of candidates) {
    try {
      return tryParseJsonCandidate<T>(candidate);
    } catch {
      // keep scanning candidates
    }
  }

  const jsonMatch = heuristicallyFixedText.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error("The AI provider did not return valid JSON.");
  }

  return tryParseJsonCandidate<T>(jsonMatch[0]);
}

function mergeUniqueItems(values: string[], fallbackValues: string[], limit: number) {
  return [...values, ...fallbackValues].filter((value, index, array) => {
    const normalizedValue = value.trim().toLowerCase();
    return Boolean(normalizedValue) && array.findIndex((entry) => entry.trim().toLowerCase() === normalizedValue) === index;
  }).slice(0, limit);
}

function countCompletedAnalysisSections(report: ResumeAnalysisReport) {
  return Object.values(report.sectionCompleteness).filter(Boolean).length;
}

function hasMeaningfulResumeSignal(parsedData: ParsedResumeData) {
  const hasContact = Boolean(
    parsedData.personalInfo.name ||
      parsedData.personalInfo.email ||
      parsedData.personalInfo.phone,
  );
  const hasExperience = parsedData.experience.length > 0;
  const hasSupportingSection =
    Boolean(parsedData.summary.trim()) ||
    parsedData.skills.length > 0 ||
    parsedData.education.length > 0;

  return hasContact && hasExperience && hasSupportingSection;
}

function countParsedResumeSignals(parsedData: ParsedResumeData) {
  return [
    parsedData.personalInfo.name,
    parsedData.personalInfo.title,
    parsedData.personalInfo.email,
    parsedData.personalInfo.phone,
    parsedData.personalInfo.location,
    parsedData.summary,
    ...parsedData.skills,
    ...parsedData.experience.flatMap((entry) => [
      entry.title,
      entry.company,
      entry.startDate,
      entry.endDate,
      ...entry.description,
    ]),
    ...parsedData.education.flatMap((entry) => [
      entry.degree,
      entry.institution,
      entry.year,
    ]),
  ].filter((value) => typeof value === "string" && value.trim()).length;
}

function shouldRejectEmptyAIParse(parsedData: ParsedResumeData, rawText: string) {
  const readableTextLength = rawText.replace(/[^A-Za-z0-9]/g, "").length;

  return readableTextLength >= 160 && countParsedResumeSignals(parsedData) === 0;
}

/**
 * Detects when a weak AI model copies the JSON schema field names as values
 * (e.g. { name: "name", title: "title", email: "email", summary: "summary" })
 * instead of extracting real content.  Two or more matching fields is enough
 * to reject the response and trigger a retry / local-parser fallback.
 */
function isSchemaTemplateLeak(parsedData: ParsedResumeData): boolean {
  const leakCount = [
    parsedData.personalInfo.name.toLowerCase() === "name",
    parsedData.personalInfo.title.toLowerCase() === "title",
    parsedData.personalInfo.email.toLowerCase() === "email",
    parsedData.personalInfo.phone.toLowerCase() === "phone",
    parsedData.personalInfo.location.toLowerCase() === "location",
    parsedData.summary.toLowerCase() === "summary",
    parsedData.skills.some(
      (s) => s.toLowerCase() === "skills" || s.toLowerCase() === "skill",
    ),
  ].filter(Boolean).length;

  return leakCount >= 2;
}

function buildResumeParsingRetryPrompt(rawText: string) {
  return `${buildParsingPrompt(rawText)}

PARSER RETRY INSTRUCTION:
Your previous structured extraction was effectively empty even though the resume text contains readable content.
Re-read the RESUME TEXT and extract visible facts. Do not return an all-empty object unless the resume text is truly unreadable.
If a section label is missing, use the visible resume structure: top header for profile/contact, dated role blocks for experience, technology lists for skills, and degree/school/certificate text for education.
Return only the final JSON object.`;
}

function stabilizeAnalysisReport(
  reportValue: unknown,
  parsedData: ParsedResumeData,
  rawText: string,
  extractionAudit?: ResumeExtractionAudit,
) {
  const aiReport = normalizeAnalysisReport(reportValue);
  const fallbackReport = analyzeResumeFallback(parsedData, rawText);
  const audit = extractionAudit ?? auditResumeExtraction(parsedData, rawText);
  const aiCompletedSections = countCompletedAnalysisSections(aiReport);
  const fallbackCompletedSections = countCompletedAnalysisSections(fallbackReport);
  const meaningfulResumeSignal = hasMeaningfulResumeSignal(parsedData);
  const auditTips = Object.entries(audit)
    .flatMap(([, issues]) => issues)
    .slice(0, 5);

  const suspiciouslyLowScore =
    meaningfulResumeSignal &&
    fallbackReport.score >= 35 &&
    (
      aiReport.score <= 10 ||
      aiReport.score + 30 < fallbackReport.score ||
      (auditTips.length >= 2 && aiReport.score + 20 < fallbackReport.score)
    );
  const suspiciouslyEmptySections =
    meaningfulResumeSignal &&
    aiCompletedSections === 0 &&
    fallbackCompletedSections >= 3;
  const suspiciouslyLowReadability =
    rawText.trim().length >= 200 &&
    fallbackReport.readabilityScore >= 30 &&
    aiReport.readabilityScore <= 10;

  return normalizeAnalysisReport({
    score: suspiciouslyLowScore ? fallbackReport.score : aiReport.score,
    readabilityScore: suspiciouslyLowReadability
      ? fallbackReport.readabilityScore
      : Math.max(aiReport.readabilityScore, fallbackReport.readabilityScore),
    missingKeywords: mergeUniqueItems(
      aiReport.missingKeywords,
      fallbackReport.missingKeywords,
      8,
    ),
    tips: mergeUniqueItems(
      mergeUniqueItems(aiReport.tips, fallbackReport.tips, 8),
      auditTips,
      8,
    ),
    sectionCompleteness: suspiciouslyEmptySections
      ? fallbackReport.sectionCompleteness
      : {
          personalInfo:
            aiReport.sectionCompleteness.personalInfo ||
            fallbackReport.sectionCompleteness.personalInfo,
          summary:
            aiReport.sectionCompleteness.summary ||
            fallbackReport.sectionCompleteness.summary,
          skills:
            aiReport.sectionCompleteness.skills ||
            fallbackReport.sectionCompleteness.skills,
          experience:
            aiReport.sectionCompleteness.experience ||
            fallbackReport.sectionCompleteness.experience,
          education:
            aiReport.sectionCompleteness.education ||
            fallbackReport.sectionCompleteness.education,
        },
  });
}

function createOpenAIJsonFormat(
  name: string,
  schema: Record<string, unknown>,
  description?: string,
): OpenAIResponseFormat {
  return {
    type: "json_schema",
    name,
    strict: true,
    schema,
    description,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withRetry<T>(
  operation: () => Promise<T>,
  {
    attempts,
    errorMessage,
    shouldRetry,
  }: {
    attempts: number;
    errorMessage: string;
    shouldRetry?: (error: unknown) => boolean;
  },
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < attempts && (shouldRetry ? shouldRetry(error) : true)) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }

      break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(errorMessage);
}

/**
 * Sends a plain-text prompt to Gemini with a small retry window for transient failures.
 */
export async function callGemini(
  prompt: string,
  options: GeminiCallOptions = {},
) {
  return withRetry(
    async () => {
      const result = await withTimeout(
        generateGeminiTextWithFallback(prompt, options),
        AI_PROVIDER_REQUEST_TIMEOUT_MS,
        "Gemini request timed out.",
      );

      return result.text;
    },
    {
      attempts: GEMINI_MAX_ATTEMPTS,
      errorMessage: "Gemini request failed.",
      shouldRetry: shouldRetryGeminiRequest,
    },
  );
}

/**
 * Requests structured JSON from Gemini and normalizes markdown-wrapped responses.
 */
export async function callGeminiJson<T>(
  prompt: string,
  schema: ResponseSchema,
  maxOutputTokens = RESUME_PARSE_OUTPUT_TOKENS,
  options: Pick<GeminiGenerationOptions, "preferredRouterIndex"> & { temperature?: number } = {},
) {
  const responseText = await callGemini(prompt, {
    maxOutputTokens,
    preferredRouterIndex: options.preferredRouterIndex,
    responseMimeType: "application/json",
    responseSchema: schema,
    temperature: options.temperature ?? 0.2,
  });

  return extractJsonFromText<T>(responseText);
}

/**
 * Sends a prompt through the OpenAI Responses API and returns the aggregated text output.
 */
export async function callOpenAI(
  prompt: string,
  options: OpenAICallOptions = {},
) {
  return withRetry(
    async () => {
      const client = getOpenAIClient();
      const requestParams = {
        model: OPENAI_MODEL,
        input: prompt,
        max_output_tokens: options.maxOutputTokens ?? RESUME_PARSE_OUTPUT_TOKENS,
        temperature: options.temperature ?? 0.2,
        text: options.text,
      } as const;

      const responseText = options.stream
        ? await withTimeout(
            streamOpenAIResponseText(client, requestParams),
            AI_PROVIDER_REQUEST_TIMEOUT_MS,
            "OpenAI request timed out.",
          )
        : (
            await withTimeout(
              client.responses.create(requestParams),
              AI_PROVIDER_REQUEST_TIMEOUT_MS,
              "OpenAI request timed out.",
            )
          ).output_text?.trim();

      if (!responseText) {
        throw new Error("OpenAI did not return any text.");
      }

      return responseText;
    },
    {
      attempts: OPENAI_MAX_ATTEMPTS,
      errorMessage: "OpenAI request failed.",
    },
  );
}

/**
 * Streams the OpenAI Responses API, aggregating output_text deltas into the full
 * response. Small token chunks are accumulated as they arrive so a slow or large
 * structured output never blocks on a single buffered round-trip.
 */
async function streamOpenAIResponseText(
  client: OpenAI,
  params: Parameters<OpenAI["responses"]["stream"]>[0],
) {
  const streamHandle = client.responses.stream(params);
  let aggregated = "";

  for await (const event of streamHandle) {
    if (event.type === "response.output_text.delta") {
      aggregated += event.delta ?? "";
    }
  }

  if (!aggregated) {
    const finalResponse = await streamHandle.finalResponse();
    aggregated = finalResponse.output_text ?? "";
  }

  return aggregated.trim();
}

/**
 * Sends a prompt through the Anthropic Messages API and returns the aggregated
 * text output. Always streams (per Anthropic guidance for large max_tokens) and
 * accumulates text deltas, which keeps latency low for step-by-step extraction.
 */
export async function callAnthropic(
  prompt: string,
  options: { system?: string; maxOutputTokens?: number } = {},
) {
  return withRetry(
    async () => {
      const client = getAnthropicClient();
      const responseText = await withTimeout(
        streamAnthropicMessageText(client, prompt, options),
        AI_PROVIDER_REQUEST_TIMEOUT_MS,
        "Anthropic request timed out.",
      );

      if (!responseText) {
        throw new Error("Anthropic did not return any text.");
      }

      return responseText;
    },
    {
      attempts: ANTHROPIC_MAX_ATTEMPTS,
      errorMessage: "Anthropic request failed.",
    },
  );
}

async function streamAnthropicMessageText(
  client: Anthropic,
  prompt: string,
  options: { system?: string; maxOutputTokens?: number },
) {
  const streamHandle = client.messages.stream({
    model: ANTHROPIC_MODEL,
    max_tokens: options.maxOutputTokens ?? RESUME_PARSE_OUTPUT_TOKENS,
    ...(options.system ? { system: options.system } : {}),
    messages: [{ role: "user", content: prompt }],
  });

  let aggregated = "";

  for await (const event of streamHandle) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      aggregated += event.delta.text;
    }
  }

  if (!aggregated) {
    const finalMessage = await streamHandle.finalMessage();
    aggregated = finalMessage.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  }

  return aggregated.trim();
}

/**
 * Requests JSON from Anthropic. The extraction prompts already instruct strict
 * JSON output ("first char {, last char }"), so the streamed text is parsed with
 * the shared tolerant JSON extractor (jsonrepair-backed) rather than a
 * provider-specific schema enforcer.
 */
export async function callAnthropicJson<T>(
  prompt: string,
  maxOutputTokens = RESUME_PARSE_OUTPUT_TOKENS,
) {
  const responseText = await callAnthropic(prompt, { maxOutputTokens });
  return extractJsonFromText<T>(responseText);
}

export async function callHuggingFace(
  prompt: string,
  options: HuggingFaceCallOptions = {},
) {
  return withRetry(
    async () => {
      const fittedRequest = fitHuggingFacePrompt(
        prompt,
        options.maxOutputTokens ?? RESUME_PARSE_OUTPUT_TOKENS,
      );
      const result = await withTimeout(
        generateHuggingFaceTextWithFallback(
          [{ role: "user", content: fittedRequest.prompt }],
          {
            maxOutputTokens: fittedRequest.maxOutputTokens,
            preferredRouterIndex: options.preferredRouterIndex,
            temperature: options.temperature ?? 0.2,
          },
        ),
        AI_PROVIDER_REQUEST_TIMEOUT_MS,
        "Hugging Face request timed out.",
      );

      return result.text;
    },
    {
      attempts: HUGGINGFACE_MAX_ATTEMPTS,
      errorMessage: "Hugging Face request failed.",
    },
  );
}

/**
 * Requests structured JSON from OpenAI using strict JSON schema output.
 */
export async function callOpenAIJson<T>(
  prompt: string,
  schema: Record<string, unknown>,
  formatName: string,
  maxOutputTokens = RESUME_PARSE_OUTPUT_TOKENS,
  options: { temperature?: number } = {},
) {
  const responseText = await callOpenAI(prompt, {
    maxOutputTokens,
    temperature: options.temperature ?? 0.2,
    text: {
      format: createOpenAIJsonFormat(formatName, schema),
      verbosity: "low",
    },
    stream: true,
  });

  return extractJsonFromText<T>(responseText);
}

export async function callHuggingFaceJson<T>(
  prompt: string,
  maxOutputTokens = RESUME_PARSE_OUTPUT_TOKENS,
  options: Pick<HuggingFaceGenerationOptions, "preferredRouterIndex"> = {},
) {
  const responseText = await callHuggingFace(prompt, {
    maxOutputTokens,
    temperature: 0.2,
    preferredRouterIndex: options.preferredRouterIndex,
  });

  return extractJsonFromText<T>(responseText);
}

/**
 * Sends a system + user message pair to HuggingFace and returns the raw text.
 * Uses fitHuggingFaceMessages() so both messages are budgeted against the
 * context window independently, maximising space for the resume text.
 */
export async function callHuggingFaceWithMessages(
  systemMessage: string,
  userContent: string,
  options: HuggingFaceCallOptions = {},
) {
  return withRetry(
    async () => {
      const { messages, maxOutputTokens } = fitHuggingFaceMessages(
        systemMessage,
        userContent,
        options.maxOutputTokens ?? HUGGINGFACE_RESUME_PARSE_OUTPUT_TOKENS,
      );
      const result = await withTimeout(
        generateHuggingFaceTextWithFallback(messages, {
          maxOutputTokens,
          preferredRouterIndex: options.preferredRouterIndex,
          temperature: options.temperature ?? 0.2,
        }),
        AI_PROVIDER_REQUEST_TIMEOUT_MS,
        "Hugging Face request timed out.",
      );

      return result.text;
    },
    {
      attempts: HUGGINGFACE_MAX_ATTEMPTS,
      errorMessage: "Hugging Face request failed.",
    },
  );
}

/**
 * Requests structured JSON from HuggingFace using a system + user message split.
 * More reliable than the single-message approach for instruction-following models.
 */
export async function callHuggingFaceJsonWithMessages<T>(
  systemMessage: string,
  userContent: string,
  maxOutputTokens = HUGGINGFACE_RESUME_PARSE_OUTPUT_TOKENS,
  options: Pick<HuggingFaceGenerationOptions, "preferredRouterIndex"> & { temperature?: number } = {},
) {
  const responseText = await callHuggingFaceWithMessages(systemMessage, userContent, {
    maxOutputTokens,
    temperature: options.temperature ?? 0.2,
    preferredRouterIndex: options.preferredRouterIndex,
  });

  return extractJsonFromText<T>(responseText);
}

function buildParsingPrompt(rawText: string) {
  return buildResumeParsingPrompt(rawText);
}

function buildAnalysisPrompt(
  parsedData: ParsedResumeData,
  rawContext: string,
  extractionAudit?: ResumeExtractionAudit,
) {
  return buildResumeAnalysisPrompt(parsedData, rawContext, extractionAudit);
}

function buildAnalysisRawContext(
  rawText: string,
  extractionAudit?: ResumeExtractionAudit,
) {
  if (!rawText.trim()) {
    return "";
  }

  if (!extractionAudit) {
    return rawText;
  }

  const structure = extractResumeStructureContext(rawText);
  const flaggedSections = Object.entries(extractionAudit)
    .filter(([, issues]) => issues.length > 0)
    .map(([section]) => section as ResumeSectionKey);

  if (!flaggedSections.length) {
    return structure.headerText;
  }

  return [
    structure.headerText ? `HEADER:\n${structure.headerText}` : "",
    flaggedSections.includes("summary") && structure.sections.summary
      ? `SUMMARY:\n${structure.sections.summary}`
      : "",
    flaggedSections.includes("skills") && structure.sections.skills
      ? `SKILLS:\n${structure.sections.skills}`
      : "",
    flaggedSections.includes("experience") && structure.sections.experience
      ? `EXPERIENCE:\n${structure.sections.experience}`
      : "",
    flaggedSections.includes("education") && structure.sections.education
      ? `EDUCATION:\n${structure.sections.education}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n") || structure.headerText || rawText;
}

function normalizeComparableText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function looksLikeProfileNameLeak(value: string) {
  const normalized = normalizeComparableText(value);

  return Boolean(
    normalized &&
      (
        /\b(?:backend|frontend|front end|back end|full stack|software|engineer|developer|architect|blockchain|cloud|devops|data|skills?|experience|education|summary|profile|remote)\b/i.test(
          normalized,
        ) ||
        /[|•·]/.test(value)
      ),
  );
}

function looksLikeExperienceRowLeak(value: string) {
  const normalized = normalizeComparableText(value);

  return Boolean(
    normalized &&
      (
        /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|19\d{2}|20\d{2}|present|current|remote|hybrid|onsite|on site)\b/i.test(
          normalized,
        ) &&
        /[|•·-]/.test(value)
      ),
  );
}

function looksLikeProfileLocationLeak(value: string) {
  const normalized = normalizeComparableText(value);

  return Boolean(
    normalized &&
      (
        /\b(?:university|college|school|institute|academy|employer|company|remote|hybrid|onsite|on site)\b/i.test(
          normalized,
        ) ||
        /[|•·]/.test(value)
      ),
  );
}

function sanitizeProfileCandidate(candidate: ResumePersonalInfo) {
  return {
    ...candidate,
    name: looksLikeProfileNameLeak(candidate.name) ? "" : candidate.name,
    title: looksLikeExperienceRowLeak(candidate.title) ? "" : candidate.title,
    location: looksLikeProfileLocationLeak(candidate.location) ? "" : candidate.location,
  };
}

function hasStrongProfileLeakSignal(
  entry: ResumeExperience,
  parsedData: ParsedResumeData,
) {
  const titleComparable = normalizeComparableText(entry.title);
  const companyComparable = normalizeComparableText(entry.company);
  const locationComparable = normalizeComparableText(entry.location);
  const profileTitleComparable = normalizeComparableText(parsedData.personalInfo.title);
  const profileLocationComparable = normalizeComparableText(parsedData.personalInfo.location);
  const summaryComparable = normalizeComparableText(parsedData.summary);
  const descriptionComparable = normalizeComparableText(entry.description.join(" "));

  const titleMatchesProfile =
    Boolean(titleComparable) &&
    Boolean(profileTitleComparable) &&
    (
      titleComparable === profileTitleComparable ||
      titleComparable.includes(profileTitleComparable) ||
      profileTitleComparable.includes(titleComparable)
    );

  const locationMatchesProfile =
    Boolean(locationComparable) &&
    Boolean(profileLocationComparable) &&
    (
      locationComparable === profileLocationComparable ||
      locationComparable.includes(profileLocationComparable) ||
      profileLocationComparable.includes(locationComparable)
    );

  const descriptionLooksLikeSummary =
    Boolean(descriptionComparable) &&
    Boolean(summaryComparable) &&
    (
      descriptionComparable === summaryComparable ||
      descriptionComparable.includes(summaryComparable.slice(0, Math.min(summaryComparable.length, 120))) ||
      summaryComparable.includes(descriptionComparable.slice(0, Math.min(descriptionComparable.length, 120)))
    );

  return (
    !companyComparable &&
    !entry.startDate &&
    !entry.endDate &&
    titleMatchesProfile &&
    (locationMatchesProfile || descriptionLooksLikeSummary)
  );
}

function stripProfileLeaksFromExperience(parsedData: ParsedResumeData) {
  const cleanedExperience = parsedData.experience.filter(
    (entry) => !hasStrongProfileLeakSignal(entry, parsedData),
  );

  return normalizeParsedResumeData({
    ...parsedData,
    experience: cleanedExperience,
  });
}

function getSectionSchema(section: ResumeSectionKey) {
  switch (section) {
    case "personalInfo":
      return {
        gemini: profileSectionSchema,
        openai: profileSectionJsonSchema,
        formatName: "resume_profile_section",
      };
    case "summary":
      return {
        gemini: summarySectionSchema,
        openai: summarySectionJsonSchema,
        formatName: "resume_summary_section",
      };
    case "skills":
      return {
        gemini: skillsSectionSchema,
        openai: skillsSectionJsonSchema,
        formatName: "resume_skills_section",
      };
    case "experience":
      return {
        gemini: experienceSectionSchema,
        openai: experienceSectionJsonSchema,
        formatName: "resume_experience_section",
      };
    case "education":
      return {
        gemini: educationSectionSchema,
        openai: educationSectionJsonSchema,
        formatName: "resume_education_section",
      };
  }
}

function buildSectionWrapper(
  section: ResumeSectionKey,
  value: SectionResultMap[ResumeSectionKey],
) {
  switch (section) {
    case "personalInfo":
      return normalizeParsedResumeData({ personalInfo: value });
    case "summary":
      return normalizeParsedResumeData({ summary: value });
    case "skills":
      return normalizeParsedResumeData({ skills: value });
    case "experience":
      return normalizeParsedResumeData({ experience: value });
    case "education":
      return normalizeParsedResumeData({ education: value });
  }
}

function validateSectionValue(
  section: ResumeSectionKey,
  value: SectionResultMap[ResumeSectionKey],
  localValue?: SectionResultMap[ResumeSectionKey],
) {
  switch (section) {
    case "personalInfo": {
      const candidate = value as ResumePersonalInfo;

      if (!candidate) {
        return false;
      }

      if (
        candidate.name &&
        (
          /@|https?:\/\//i.test(candidate.name) ||
          /\d{3,}/.test(candidate.name) ||
          looksLikeProfileNameLeak(candidate.name)
        )
      ) {
        return false;
      }

      if (candidate.title && looksLikeExperienceRowLeak(candidate.title)) {
        return false;
      }

      if (candidate.location && looksLikeProfileLocationLeak(candidate.location)) {
        return false;
      }

      return Boolean(
        candidate.name ||
          candidate.title ||
          candidate.email ||
          candidate.phone ||
          candidate.location ||
          candidate.links.length,
      );
    }
    case "summary": {
      const summary = String(value || "").trim();
      if (!summary) {
        return true;
      }
      if (
        /(?:linkedin\.com|github\.com|gitlab\.com|bitbucket\.org|@)/i.test(summary) &&
        summary.split(/\s+/).length < 40
      ) {
        return false;
      }
      return true;
    }
    case "skills": {
      const skills = (Array.isArray(value) ? value : []) as string[];
      const localSkills = (Array.isArray(localValue) ? localValue : []) as string[];
      if (!skills.length) {
        return true;
      }
      if (skills.some((skill) => typeof skill !== "string" || !skill.trim())) {
        return false;
      }
      const localGrouped = localSkills.filter((skill) => skill.includes(":")).length;
      const aiGrouped = skills.filter((skill) => skill.includes(":")).length;
      if (localGrouped > 0 && aiGrouped === 0 && skills.length + 2 < localSkills.length) {
        return false;
      }
      return true;
    }
    case "experience": {
      const experience = (Array.isArray(value) ? value : []) as ResumeExperience[];
      if (!experience.length) {
        return true;
      }
      const populatedRoles = experience.filter(
        (entry) => entry.title || entry.company || entry.description.length > 0,
      );
      if (!populatedRoles.length) {
        return false;
      }
      return true;
    }
    case "education": {
      const education = (Array.isArray(value) ? value : []) as ResumeEducation[];
      if (!education.length) {
        return true;
      }
      const populatedEntries = education.filter(
        (entry) => entry.degree || entry.institution || entry.year,
      );
      if (!populatedEntries.length) {
        return false;
      }
      return true;
    }
  }
}

function mergeSectionValue(
  section: ResumeSectionKey,
  localValue: SectionResultMap[ResumeSectionKey] | undefined,
  aiValue: SectionResultMap[ResumeSectionKey],
): {
  value: SectionResultMap[ResumeSectionKey];
  meta: {
    source: ResumeSectionExtractionMeta["source"];
    confidence: number;
    issues: string[];
  };
} {
  const safeLocalValue =
    section === "personalInfo" && localValue
      ? (sanitizeProfileCandidate(
          normalizeParsedResumeData({ personalInfo: localValue }).personalInfo,
        ) as SectionResultMap[ResumeSectionKey])
      : localValue;
  const hasLocalValue =
    section === "personalInfo"
      ? Boolean(
          safeLocalValue &&
            typeof safeLocalValue === "object" &&
            !Array.isArray(safeLocalValue) &&
            (
              (safeLocalValue as ResumePersonalInfo).name ||
              (safeLocalValue as ResumePersonalInfo).title ||
              (safeLocalValue as ResumePersonalInfo).email ||
              (safeLocalValue as ResumePersonalInfo).phone ||
              (safeLocalValue as ResumePersonalInfo).location ||
              (safeLocalValue as ResumePersonalInfo).links?.length
            ),
        )
      : section === "summary"
      ? Boolean(String(safeLocalValue || "").trim())
      : section === "skills"
        ? Array.isArray(safeLocalValue) && safeLocalValue.length > 0
        : false;

  if (!validateSectionValue(section, aiValue, localValue)) {
    return {
      value: (safeLocalValue ?? aiValue) as SectionResultMap[ResumeSectionKey],
      meta: {
        source: hasLocalValue ? "local" : "ai",
        confidence: 72,
        issues: ["AI output for this section did not pass validation."],
      },
    };
  }

  if (!hasLocalValue) {
    return {
      value: aiValue,
      meta: {
        source: "ai",
        confidence: 90,
        issues: [],
      },
    };
  }

  const localWrapped = buildSectionWrapper(
    section,
    safeLocalValue as SectionResultMap[ResumeSectionKey],
  );
  const aiWrapped = buildSectionWrapper(section, aiValue);
  const merged = mergeParsedResumeData(aiWrapped, localWrapped);
  const localNormalized = localWrapped[section];
  const aiNormalized = aiWrapped[section];
  const mergedValue = merged[section];

  if (section === "skills") {
    const localSkills = localNormalized as string[];
    const aiSkills = aiNormalized as string[];
    const mergedSkills = mergedValue as string[];
    const localGrouped = localSkills.filter((skill) => skill.includes(":")).length;

    if (localGrouped > 0 && mergedSkills.length < localSkills.length) {
      return {
        value: localSkills,
        meta: {
          source: "local" as const,
          confidence: 88,
          issues: ["Local grouped skills were kept because AI omitted visible category items."],
        },
      };
    }

    return {
      value: mergedSkills,
      meta: {
        source: aiSkills.length ? "merged" : "local",
        confidence: mergedSkills.length >= localSkills.length ? 92 : 82,
        issues: [],
      },
    };
  }

  if (section === "summary") {
    const localSummary = String(localNormalized || "").trim();
    const aiSummary = String(aiNormalized || "").trim();
    const mergedSummary = String(mergedValue || "").trim();
    const bestSummary =
      localSummary && localSummary.length > aiSummary.length + 20
        ? localSummary
        : mergedSummary;

    return {
      value: bestSummary,
      meta: {
        source: aiSummary ? "merged" : "local",
        confidence: bestSummary.length >= Math.max(localSummary.length, aiSummary.length) ? 94 : 84,
        issues: [],
      },
    };
  }

  if (section === "personalInfo") {
    const localProfile = sanitizeProfileCandidate(localNormalized as ResumePersonalInfo);
    const aiProfile = sanitizeProfileCandidate(aiNormalized as ResumePersonalInfo);
    const mergedProfile = mergeParsedResumeData(
      { personalInfo: aiProfile },
      { personalInfo: localProfile },
    ).personalInfo;
    const value = {
      ...mergedProfile,
      email: localProfile.email || aiProfile.email || mergedProfile.email,
      phone: localProfile.phone || aiProfile.phone || mergedProfile.phone,
      links: localProfile.links.length ? localProfile.links : mergedProfile.links,
    };

    return {
      value,
      meta: {
        source:
          aiProfile.name ||
          aiProfile.title ||
          aiProfile.location ||
          aiProfile.links.length
            ? "merged"
            : "local",
        confidence: 90,
        issues: [],
      },
    };
  }

  return {
    value: mergedValue as SectionResultMap[ResumeSectionKey],
    meta: {
      source:
        Array.isArray(aiNormalized)
          ? (aiNormalized.length ? "merged" : "local")
          : aiNormalized
            ? "merged"
            : "local",
      confidence: 90,
      issues: [],
    },
  };
}

export async function extractResumeSectionWithAI(
  section: ResumeSectionKey,
  context: ResumeSectionExtractionContext,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  options: AIExecutionOptions = {},
): Promise<SectionResultMap[ResumeSectionKey]> {
  const prompt =
    section === "personalInfo"
      ? buildResumeProfileExtractionPrompt(context)
      : section === "summary"
        ? buildResumeSummaryExtractionPrompt(context)
        : buildResumeSectionExtractionPrompt(section, context);
  const schema = getSectionSchema(section);

  const response =
    provider === "openai"
      ? await callOpenAIJson<Record<string, unknown>>(
          prompt,
          schema.openai,
          schema.formatName,
          RESUME_PARSE_OUTPUT_TOKENS,
        )
      : provider === "anthropic"
      ? await callAnthropicJson<Record<string, unknown>>(
          prompt,
          RESUME_PARSE_OUTPUT_TOKENS,
        )
      : provider === "huggingface"
        ? await callHuggingFaceJson<Record<string, unknown>>(
            prompt,
            HUGGINGFACE_RESUME_PARSE_OUTPUT_TOKENS,
            { preferredRouterIndex: options.huggingFaceRouterIndex },
          )
        : await callGeminiJson<Record<string, unknown>>(
            prompt,
            schema.gemini,
            RESUME_PARSE_OUTPUT_TOKENS,
            { preferredRouterIndex: options.geminiRouterIndex },
          );

  const normalized = normalizeParsedResumeData(response);
  return normalized[section] as SectionResultMap[ResumeSectionKey];
}

async function runSequentialResumeExtraction(
  rawText: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  options: AIExecutionOptions = {},
  hooks: SequentialExtractionHooks = {},
) {
  const structure = extractResumeStructureContext(rawText);
  const localParsedData = parseResumeFallback(structure.normalizedText);
  const localSkills = extractLocalSkillsCandidate(rawText);
  const parsedData = createEmptyParsedResumeData();
  const extractionMeta = createEmptyResumeExtractionMeta();
  extractionMeta.rawTextAvailable = Boolean(structure.normalizedText.trim());

  for (const section of [
    "personalInfo",
    "summary",
    "skills",
    "experience",
    "education",
  ] as const) {
    await hooks.onBeforeSection?.(section);
    const rawSectionText =
      section === "personalInfo"
        ? structure.headerText
        : section === "summary"
          ? structure.sections.summary || structure.normalizedText
          : structure.sections[section];
    const localValue =
      section === "personalInfo"
        ? (localParsedData.personalInfo as SectionResultMap[typeof section])
        : section === "summary"
          ? (structure.sections.summary as SectionResultMap[typeof section])
          : section === "skills"
            ? (localSkills as SectionResultMap[typeof section])
            : undefined;
    const sectionText =
      section === "skills" &&
      Array.isArray(localValue) &&
      localValue.length > 0 &&
      !rawSectionText.trim()
        ? localValue.join("\n")
        : rawSectionText;
    const shouldSkipAi =
      section !== "personalInfo" &&
      !sectionText.trim() &&
      !(section === "skills" && Array.isArray(localValue) && localValue.length > 0);
    let aiValue =
      (localValue ??
        (section === "personalInfo"
          ? createEmptyParsedResumeData().personalInfo
          : section === "summary"
            ? ""
            : [])) as SectionResultMap[typeof section];
    const issues: string[] = [];

    if (shouldSkipAi) {
      parsedData[section] = (
        section === "skills" && Array.isArray(localValue) && localValue.length > 0
          ? localValue
          : section === "summary"
            ? ""
            : []
      ) as never;
      extractionMeta.sections[section] = {
        source: section === "skills" && localValue ? "local" : "ai",
        confidence: 100,
        updatedAt: new Date().toISOString(),
        issues: [
          section === "skills" && localValue
            ? "Used local skills extraction because the skills section text was weak or fragmented."
            : "Skipped AI extraction because this section was not detected in the resume text.",
        ],
      };
      await hooks.onAfterSection?.(section, extractionMeta.sections[section]);
      continue;
    }

    try {
      aiValue = await withTimeout(
        extractResumeSectionWithAI(
          section,
          {
            headerText: structure.headerText,
            sectionText,
            parsedSoFar: parsedData,
            localCandidate:
              section === "personalInfo" || section === "summary" || section === "skills"
                ? localValue
                : undefined,
          },
          provider,
          options,
        ),
        SECTION_AI_TIMEOUT_MS,
        `${section} AI extraction timed out.`,
      );
    } catch (error) {
      issues.push(
        error instanceof Error
          ? `${section} AI extraction failed: ${error.message}`
          : `${section} AI extraction failed.`,
      );
    }

    const merged = mergeSectionValue(section, localValue, aiValue);
    parsedData[section] = merged.value as never;
    extractionMeta.sections[section] = {
      source: merged.meta.source,
      confidence: merged.meta.confidence,
      updatedAt: new Date().toISOString(),
      issues: [...issues, ...merged.meta.issues],
    };
    await hooks.onAfterSection?.(section, extractionMeta.sections[section]);
  }

  const normalizedParsedData = normalizeParsedResumeData(parsedData);
  const cleanedParsedData = stripProfileLeaksFromExperience(normalizedParsedData);

  return {
    parsedData: cleanedParsedData,
    extractionMeta: normalizeResumeExtractionMeta(extractionMeta),
    extractionAudit: auditResumeExtraction(cleanedParsedData, structure.normalizedText),
  } satisfies SequentialResumeExtractionResult;
}

export async function extractResumeSequentially(
  rawText: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  options: AIExecutionOptions = {},
  hooks: SequentialExtractionHooks = {},
) {
  return runSequentialResumeExtraction(rawText, provider, options, hooks);
}

export async function refreshResumeSectionWithAI(
  parsedData: ParsedResumeData,
  rawText: string,
  section: ResumeSectionKey,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  options: AIExecutionOptions = {},
) {
  const structure = extractResumeStructureContext(rawText);
  const localParsedData = parseResumeFallback(structure.normalizedText);
  const rawSectionText =
    section === "personalInfo"
      ? structure.headerText
      : section === "summary"
        ? structure.sections.summary || structure.normalizedText
        : structure.sections[section];
  const localValue =
    section === "personalInfo"
      ? (localParsedData.personalInfo as SectionResultMap[typeof section])
      : section === "summary"
        ? (structure.sections.summary as SectionResultMap[typeof section])
        : section === "skills"
          ? (extractLocalSkillsCandidate(rawText) as SectionResultMap[typeof section])
          : undefined;
  const sectionText =
    section === "skills" &&
    Array.isArray(localValue) &&
    localValue.length > 0 &&
    !rawSectionText.trim()
      ? localValue.join("\n")
      : rawSectionText;
  let aiValue =
    (localValue ??
      (section === "personalInfo"
        ? createEmptyParsedResumeData().personalInfo
        : section === "summary"
          ? ""
          : [])) as SectionResultMap[typeof section];
  const extractionMeta = createEmptyResumeExtractionMeta();
  extractionMeta.rawTextAvailable = Boolean(structure.normalizedText.trim());
  const issues: string[] = [];

  if (
    section !== "personalInfo" &&
    !sectionText.trim() &&
    !(section === "skills" && Array.isArray(localValue) && localValue.length > 0)
  ) {
    const nextParsedData = normalizeParsedResumeData({
      ...parsedData,
      [section]:
        section === "skills" && Array.isArray(localValue) && localValue.length > 0
          ? localValue
          : section === "summary"
            ? ""
            : [],
    });
    extractionMeta.sections[section] = {
      source: section === "skills" && localValue ? "local" : "ai",
      confidence: 100,
      updatedAt: new Date().toISOString(),
      issues: ["Skipped AI extraction because this section was not detected in the resume text."],
    };

    return {
      parsedData: nextParsedData,
      extractionMeta: normalizeResumeExtractionMeta(extractionMeta),
      extractionAudit: auditResumeExtraction(nextParsedData, structure.normalizedText),
    } satisfies SequentialResumeExtractionResult;
  }

  try {
    aiValue = await extractResumeSectionWithAI(
      section,
      {
        headerText: structure.headerText,
        sectionText,
        parsedSoFar: parsedData,
        localCandidate:
          section === "personalInfo" || section === "summary" || section === "skills"
            ? localValue
            : undefined,
      },
      provider,
      options,
    );
  } catch (error) {
    issues.push(
      error instanceof Error
        ? `${section} AI extraction failed: ${error.message}`
        : `${section} AI extraction failed.`,
    );
  }

  const merged = mergeSectionValue(section, localValue, aiValue);
  const nextParsedData = stripProfileLeaksFromExperience(normalizeParsedResumeData({
    ...parsedData,
    [section]: merged.value,
  }));
  extractionMeta.sections[section] = {
    source: merged.meta.source,
    confidence: merged.meta.confidence,
    updatedAt: new Date().toISOString(),
    issues: [...issues, ...merged.meta.issues],
  };

  return {
    parsedData: nextParsedData,
    extractionMeta: normalizeResumeExtractionMeta(extractionMeta),
    extractionAudit: auditResumeExtraction(nextParsedData, structure.normalizedText),
  } satisfies SequentialResumeExtractionResult;
}

export async function parseResumeWithAI(
  rawText: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  options: AIExecutionOptions = {},
  hooks: { onRetry?: () => void } = {},
) {
  const requestParse = async (prompt: string) => {
    const response =
      provider === "openai"
        ? await callOpenAIJson<ParsedResumeData>(
            prompt,
            parsedResumeJsonSchema,
            "parsed_resume",
            RESUME_PARSE_OUTPUT_TOKENS,
          )
        : provider === "anthropic"
        ? await callAnthropicJson<ParsedResumeData>(
            prompt,
            RESUME_PARSE_OUTPUT_TOKENS,
          )
        : provider === "huggingface"
          ? await callHuggingFaceJson<ParsedResumeData>(
              prompt,
              HUGGINGFACE_RESUME_PARSE_OUTPUT_TOKENS,
              { preferredRouterIndex: options.huggingFaceRouterIndex },
            )
          : await callGeminiJson<ParsedResumeData>(
              prompt,
              parsedResumeSchema,
              RESUME_PARSE_OUTPUT_TOKENS,
              { preferredRouterIndex: options.geminiRouterIndex },
            );

    return normalizeParsedResumeData(response);
  };

  const parsedData = await requestParse(buildParsingPrompt(rawText));

  const firstParseIsBad =
    shouldRejectEmptyAIParse(parsedData, rawText) || isSchemaTemplateLeak(parsedData);

  if (!firstParseIsBad) {
    return parsedData;
  }

  if (isSchemaTemplateLeak(parsedData)) {
    console.warn(
      `[parseResumeWithAI] Schema template leak detected (${provider}) — retrying with explicit instruction.`,
    );
  }

  // Notify the caller so it can surface a retry event in the task timeline.
  hooks.onRetry?.();

  const retriedParsedData = await requestParse(buildResumeParsingRetryPrompt(rawText));

  const retryIsBad =
    shouldRejectEmptyAIParse(retriedParsedData, rawText) ||
    isSchemaTemplateLeak(retriedParsedData);

  if (retryIsBad) {
    throw new Error(
      "Resume extraction returned no structured data. Please try re-exporting the resume as a text-based PDF or DOCX.",
    );
  }

  // First parse was bad — always prefer the good retry result.
  // If first parse was good (shouldn't reach here, but guard anyway), pick by signal count.
  if (firstParseIsBad) {
    return retriedParsedData;
  }

  return countParsedResumeSignals(retriedParsedData) >=
    countParsedResumeSignals(parsedData)
    ? retriedParsedData
    : parsedData;
}

export async function analyzeResumeWithAI(
  parsedData: ParsedResumeData,
  rawText: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  options: AIExecutionOptions = {},
  extractionAudit?: ResumeExtractionAudit,
) {
  const prompt = buildAnalysisPrompt(
    parsedData,
    buildAnalysisRawContext(rawText, extractionAudit),
    extractionAudit,
  );
  const response =
    provider === "openai"
      ? await callOpenAIJson<ResumeAnalysisReport>(
          prompt,
          analysisReportJsonSchema,
          "resume_analysis_report",
          RESUME_ANALYSIS_OUTPUT_TOKENS,
        )
      : provider === "anthropic"
      ? await callAnthropicJson<ResumeAnalysisReport>(
          prompt,
          RESUME_ANALYSIS_OUTPUT_TOKENS,
        )
      : provider === "huggingface"
        ? await callHuggingFaceJson<ResumeAnalysisReport>(
            prompt,
            RESUME_ANALYSIS_OUTPUT_TOKENS,
            { preferredRouterIndex: options.huggingFaceRouterIndex },
          )
        : await callGeminiJson<ResumeAnalysisReport>(
            prompt,
            analysisReportSchema,
            RESUME_ANALYSIS_OUTPUT_TOKENS,
            { preferredRouterIndex: options.geminiRouterIndex },
          );

  return stabilizeAnalysisReport(response, parsedData, rawText, extractionAudit);
}


function comparableTailoringText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function hasMeaningfulTextChange(originalValue: string, tailoredValue: string) {
  const originalComparable = comparableTailoringText(originalValue);
  const tailoredComparable = comparableTailoringText(tailoredValue);

  return Boolean(
    tailoredComparable &&
      tailoredComparable !== originalComparable &&
      tailoredComparable.length >= Math.max(24, originalComparable.length * 0.55),
  );
}

function countMeaningfullyChangedBullets(
  originalEntries: ResumeExperience[],
  tailoredEntries: ResumeExperience[],
) {
  return originalEntries.reduce((changedCount, originalEntry, index) => {
    const tailoredEntry = tailoredEntries[index];

    if (!tailoredEntry) {
      return changedCount;
    }

    const originalBullets = originalEntry.description.map(comparableTailoringText);
    const tailoredBullets = tailoredEntry.description.map(comparableTailoringText);
    const changedBullets = tailoredBullets.filter(
      (bullet) => bullet && !originalBullets.includes(bullet),
    );

    return changedCount + changedBullets.length;
  }, 0);
}

function getRoleTailoringCoverage(
  originalEntries: ResumeExperience[],
  tailoredEntries: ResumeExperience[],
) {
  return originalEntries.map((originalEntry, index) => {
    const tailoredEntry = tailoredEntries[index];
    const originalBullets = originalEntry.description.map(comparableTailoringText);
    const tailoredBullets = tailoredEntry?.description.map(comparableTailoringText) ?? [];
    const changedBulletCount = tailoredBullets.filter(
      (bullet) => bullet && !originalBullets.includes(bullet),
    ).length;
    const sourceBulletCount = originalEntry.description.length;
    const tailoredBulletCount = tailoredEntry?.description.length ?? 0;
    const requiredChangedBullets = sourceBulletCount >= 2 ? 2 : Math.min(1, sourceBulletCount);
    const hasEnoughChangedBullets =
      sourceBulletCount === 0 || changedBulletCount >= requiredChangedBullets;
    const hasMinimumBulletCount = sourceBulletCount < 2 || tailoredBulletCount >= 5;

    return {
      sourceIndex: index,
      titleChanged: hasMeaningfulTextChange(originalEntry.title, tailoredEntry?.title ?? ""),
      changedBulletCount,
      sourceBulletCount,
      tailoredBulletCount,
      hasEnoughChangedBullets,
      hasMinimumBulletCount,
      passed: hasEnoughChangedBullets && hasMinimumBulletCount,
    };
  });
}

function hasSkillSignalChange(originalSkills: string[], tailoredSkills: string[]) {
  const originalComparable = originalSkills.map(comparableTailoringText).filter(Boolean);
  const tailoredComparable = tailoredSkills.map(comparableTailoringText).filter(Boolean);

  if (!tailoredComparable.length) {
    return false;
  }

  const firstOriginalSkills = originalComparable.slice(0, 8).join("|");
  const firstTailoredSkills = tailoredComparable.slice(0, 8).join("|");
  const addedOrRegroupedSkills = tailoredComparable.filter(
    (skill) => !originalComparable.includes(skill),
  );

  return firstTailoredSkills !== firstOriginalSkills || addedOrRegroupedSkills.length >= 2;
}

export function validateTailoredResumeQuality(
  originalResume: ParsedResumeData,
  tailoredResume: ParsedResumeData,
  jobDescription = "",
  analyzedJobDescription?: AnalyzedJobDescription,
) {
  const original = normalizeParsedResumeData(originalResume);
  const tailored = normalizeParsedResumeData(tailoredResume);

  // ── Core change signals ───────────────────────────────────────────────────
  // Profile role title: simpler check than hasMeaningfulTextChange because titles
  // are 3-7 words and don't meet the 24-char minimum required for bullet comparisons.
  const profileRoleTitleChanged = Boolean(
    tailored.personalInfo.title?.trim() &&
      comparableTailoringText(original.personalInfo.title) !==
        comparableTailoringText(tailored.personalInfo.title),
  );
  const summaryChanged = hasMeaningfulTextChange(original.summary, tailored.summary);
  const changedBulletCount = countMeaningfullyChangedBullets(
    original.experience,
    tailored.experience,
  );
  const changedTitleCount = original.experience.filter((entry, index) =>
    hasMeaningfulTextChange(entry.title, tailored.experience[index]?.title ?? ""),
  ).length;
  const skillsChanged = hasSkillSignalChange(original.skills, tailored.skills);
  const roleTailoringCoverage = getRoleTailoringCoverage(
    original.experience,
    tailored.experience,
  );
  const weakRoleTailoring = roleTailoringCoverage.filter((role) => !role.passed);
  const hasPerRoleTailoringSignal = weakRoleTailoring.length === 0;

  // ── Structural completeness checks ────────────────────────────────────────
  const hasEnoughExperienceOutput =
    original.experience.length === 0 ||
    tailored.experience.length >= original.experience.length;

  const hasUsableBulletCoverage =
    original.experience.length === 0 ||
    tailored.experience.some((entry) => entry.description.length >= 3);

  const hasExperienceTailoringSignal =
    original.experience.length === 0 ||
    hasPerRoleTailoringSignal;

  // ── Bullet count per role (all roles must have ≥ 5 bullets) ──────────────
  // Only applied when the original role itself had at least 2 bullets —
  // if the original was sparse the AI can't magically add grounded content.
  const rolesMissingMinBullets = tailored.experience.filter((entry, index) => {
    const originalBullets = original.experience[index]?.description.length ?? 0;
    return originalBullets >= 2 && entry.description.length < 5;
  });
  const hasMinimumBulletCount = rolesMissingMinBullets.length === 0;

  // ── Unique tailored titles (roles should NOT all share the same title) ────
  const tailoredTitles = tailored.experience.map((e) => e.title.trim().toLowerCase());
  const uniqueTitleCount = new Set(tailoredTitles).size;
  const hasUniqueTitles =
    tailored.experience.length <= 1 || uniqueTitleCount >= Math.ceil(tailored.experience.length * 0.6);

  // ── Summary quality (must not be too short or identical to original) ──────
  const summaryWordCount = tailored.summary.trim().split(/\s+/).length;
  const hasSubstantialSummary = summaryWordCount >= 30;

  // ── Company name preservation (fuzzy — normalise punctuation/spacing) ─────
  // The tailoring prompt forbids changing companies, but we enforce it here too.
  // convertTailoredOutputToParsedResumeData already locks companies to the original,
  // so a failure here signals that the mapping itself went wrong.
  const normalizeIdentifier = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const hasPreservedCompanies =
    original.experience.length === 0 ||
    original.experience.every((origEntry, index) => {
      if (!origEntry.company.trim()) return true;
      const tailoredEntry = tailored.experience[index];
      if (!tailoredEntry) return true;
      const origNorm = normalizeIdentifier(origEntry.company);
      const tailNorm = normalizeIdentifier(tailoredEntry.company);
      return (
        origNorm === tailNorm ||
        origNorm.includes(tailNorm) ||
        tailNorm.includes(origNorm)
      );
    });

  // ── Experience count preservation ────────────────────────────────────────
  // AI must not silently drop roles from the output.
  const hasPreservedExperienceCount =
    original.experience.length === 0 ||
    tailored.experience.length >= original.experience.length;

  // ── JD alignment coverage ────────────────────────────────────────────────
  // Only enforce terms that are both high-priority in the JD and supported by
  // the original resume. This prevents the validator from rewarding inventions
  // such as Spring Boot when the candidate never used it.
  const priorityTerms = jobDescription
    ? buildTailoringPriorityTerms(jobDescription, analyzedJobDescription).slice(0, 24)
    : [];
  const originalSupportText = buildResumeKeywordSupportText(original);
  const tailoredSignalText = buildResumeKeywordSupportText(tailored);
  const supportedPriorityTerms = priorityTerms.filter((term) =>
    isTermSupportedBySkillInventory(term, originalSupportText.toLowerCase()),
  );
  const placedPriorityTerms = supportedPriorityTerms.filter((term) =>
    isTermSupportedBySkillInventory(term, tailoredSignalText.toLowerCase()),
  );
  const requiredPriorityCoverage =
    supportedPriorityTerms.length >= 6
      ? Math.min(5, Math.ceil(supportedPriorityTerms.length * 0.35))
      : Math.min(3, supportedPriorityTerms.length);
  const hasJobPriorityCoverage =
    !jobDescription ||
    supportedPriorityTerms.length === 0 ||
    placedPriorityTerms.length >= requiredPriorityCoverage;

  // ── Score — weighted signals ──────────────────────────────────────────────
  // Max possible: 1 + 2 + 3 + 2 + 1 + 1 + 1 = 11
  const score =
    (profileRoleTitleChanged ? 1 : 0) +
    (summaryChanged ? 2 : 0) +
    Math.min(3, changedBulletCount) +
    Math.min(2, changedTitleCount) +
    (skillsChanged ? 1 : 0) +
    (hasMinimumBulletCount ? 1 : 0) +
    (hasUniqueTitles ? 1 : 0) +
    (hasJobPriorityCoverage ? 1 : 0);

  // Require score ≥ 5 when the original has experience (raised from 4),
  // ≥ 2 for no-experience resumes (summary + skills tailoring is enough).
  const passed =
    hasEnoughExperienceOutput &&
    hasUsableBulletCoverage &&
    hasExperienceTailoringSignal &&
    hasSubstantialSummary &&
    hasPreservedCompanies &&
    hasPreservedExperienceCount &&
    hasJobPriorityCoverage &&
    hasPerRoleTailoringSignal &&
    score >= (original.experience.length ? 5 : 2);

  return {
    passed,
    score,
    profileRoleTitleChanged,
    summaryChanged,
    changedBulletCount,
    changedTitleCount,
    skillsChanged,
    hasEnoughExperienceOutput,
    hasUsableBulletCoverage,
    hasExperienceTailoringSignal,
    hasMinimumBulletCount,
    hasUniqueTitles,
    hasSubstantialSummary,
    hasPreservedCompanies,
    hasPreservedExperienceCount,
    hasJobPriorityCoverage,
    hasPerRoleTailoringSignal,
    weakRoleTailoring,
    supportedPriorityTermCount: supportedPriorityTerms.length,
    placedPriorityTermCount: placedPriorityTerms.length,
    missingPriorityTerms: supportedPriorityTerms.filter(
      (term) => !placedPriorityTerms.includes(term),
    ).slice(0, 10),
    uniqueTitleCount,
    rolesMissingMinBulletsCount: rolesMissingMinBullets.length,
  };
}


type TailoredResumeOutput = {
  profile?: {
    roleTitle?: string;
  };
  summary?: string;
  skills?: Array<{
    label?: string;
    items?: string[];
  }>;
  workExperience?: Array<{
    sourceIndex?: number;
    originalRoleTitle?: string;
    tailoredRoleTitle?: string;
    company?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    bullets?: string[];
  }>;
  education?: Array<{
    school?: string;
    degree?: string;
    field?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    details?: string[];
  }>;
};

function cleanTailoringString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanTailoringStringArray(value: unknown, limit = 200) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => cleanTailoringString(item))
    .filter(Boolean)
    .slice(0, limit);
}

function prefixSkillWithGroup(label: string, skill: string) {
  const cleanedLabel = cleanTailoringString(label);
  const cleanedSkill = cleanTailoringString(skill);

  if (!cleanedSkill) {
    return "";
  }

  if (!cleanedLabel) {
    return cleanedSkill;
  }

  const lowerLabel = cleanedLabel.toLowerCase();
  const lowerSkill = cleanedSkill.toLowerCase();

  return lowerSkill.startsWith(`${lowerLabel}:`)
    ? cleanedSkill
    : `${cleanedLabel}: ${cleanedSkill}`;
}

// Labels that indicate a catch-all / garbage-bin group — drop entirely.
const CATCHALL_SKILL_GROUP_LABELS = new Set([
  "additional skills", "additional",
  "other skills", "other",
  "miscellaneous", "misc",
  "general", "general skills",
  "technical skills",
  "tools",
  "various",
  "more skills", "extra skills",
  "soft skills", "professional skills",
]);

// Item-level blocklist (normalised keys) — mirrors GARBAGE_SKILL_NORMS in
// resume-tailoring.ts so that AI output is filtered the same way as input.
const GARBAGE_SKILL_ITEM_NORMS = new Set([
  "review", "reviews", "code review", "code reviews",
  "peer review", "peer reviews",
  "inference", "regression", "classification", "clustering",
  "prediction", "training", "fine tuning", "fine-tuning",
  "refactor", "refactoring",
  "debugging", "debug",
  "unit testing", "integration testing", "regression testing",
  "end to end testing", "e2e testing", "functional testing",
  "smoke testing", "acceptance testing", "performance testing",
  "load testing", "manual testing", "automated testing",
  "test automation", "testing", "quality assurance",
  "code quality", "clean code", "best practices", "best practice",
  "design pattern", "design patterns", "pair programming",
  "problem solving", "communication", "teamwork", "collaboration",
  "leadership", "mentoring", "mentorship", "coaching",
  "critical thinking", "analytical skills", "analytical thinking",
  "decision making", "time management", "attention to detail",
  "documentation", "technical writing", "technical documentation",
  "research", "analysis",
  "object oriented", "object-oriented", "oop",
  "object oriented programming", "object-oriented programming",
  "functional programming", "procedural programming",
  "version control", "source control", "source code management",
  "web development", "software development", "full stack development",
  "front end development", "back end development",
  "application development", "mobile development",
  "machine learning",  // too generic as an item — use specific frameworks
  "data analysis", "data processing", "data management",
  "statistical analysis", "statistical modeling",
  "feature engineering", "data preprocessing",
]);

const MAX_SKILL_GROUPS = 7;
const MAX_ITEMS_PER_GROUP = 12;

// Normalise a skill string for dedup comparison (item text only, no prefix).
function normSkillItemKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Register both singular and plural forms in the seen Set so that
// "Code Review" and "Code Reviews" are treated as identical.
function addSeenWithPlural(seen: Set<string>, key: string) {
  seen.add(key);
  if (key.endsWith("s") && key.length > 5) {
    seen.add(key.slice(0, -1)); // "code reviews" → also reserve "code review"
  } else if (!key.endsWith("s") && key.length > 4) {
    seen.add(key + "s"); // "code review" → also reserve "code reviews"
  }
}

function flattenTailoredSkillGroups(skills: TailoredResumeOutput["skills"]) {
  if (!Array.isArray(skills)) {
    return [];
  }

  // ── 1. Filter out catch-all groups and empty groups ───────────────────────
  const validGroups = skills.filter((group) => {
    const label = cleanTailoringString(group?.label).toLowerCase().trim();
    if (!label || CATCHALL_SKILL_GROUP_LABELS.has(label)) return false;
    const items = cleanTailoringStringArray(group?.items);
    return items.length > 0;
  });

  // ── 2. Cap at MAX_SKILL_GROUPS (groups arrive in JD-priority order) ───────
  const cappedGroups = validGroups.slice(0, MAX_SKILL_GROUPS);

  // ── 3. Flatten with item-level garbage filter, per-group cap, and
  //       plural-aware global deduplication ───────────────────────────────────
  const flattened: string[] = [];
  const seen = new Set<string>(); // keys are item text only (no group prefix)

  for (const group of cappedGroups) {
    const label = cleanTailoringString(group?.label);
    const items = cleanTailoringStringArray(group?.items).slice(0, MAX_ITEMS_PER_GROUP);

    for (const item of items) {
      const itemKey = normSkillItemKey(item);

      // Reject garbage items regardless of which group they're in
      if (
        !itemKey ||
        itemKey.length < 2 ||
        GARBAGE_SKILL_ITEM_NORMS.has(itemKey) ||
        !isTechnicalSkill(item)
      ) {
        continue;
      }

      // Plural-aware dedup on item text (without group prefix)
      if (seen.has(itemKey)) continue;
      addSeenWithPlural(seen, itemKey);

      const skill = prefixSkillWithGroup(label, item);
      if (skill) flattened.push(skill);
    }
  }

  return sanitizeTechnicalSkills(flattened);
}

function combineEducationDegree(degree: string, field: string) {
  if (!degree) {
    return field;
  }

  if (!field || degree.toLowerCase().includes(field.toLowerCase())) {
    return degree;
  }

  return `${degree} (${field})`;
}

function combineEducationDates(startDate: string, endDate: string) {
  if (startDate && endDate) {
    return `${startDate} - ${endDate}`;
  }

  return endDate || startDate;
}

function convertTailoredOutputToParsedResumeData(
  originalResume: ParsedResumeData,
  tailoredOutput: TailoredResumeOutput,
) {
  const normalizedOriginal = normalizeParsedResumeData(originalResume);
  const sortedWorkExperience = Array.isArray(tailoredOutput.workExperience)
    ? [...tailoredOutput.workExperience].sort(
        (left, right) => (left.sourceIndex ?? 0) - (right.sourceIndex ?? 0),
      )
    : [];

  return normalizeParsedResumeData({
    personalInfo: {
      ...normalizedOriginal.personalInfo,
      title:
        cleanTailoringString(tailoredOutput.profile?.roleTitle) ||
        normalizedOriginal.personalInfo.title,
    },
    summary: cleanTailoringString(tailoredOutput.summary) || normalizedOriginal.summary,
    skills: flattenTailoredSkillGroups(tailoredOutput.skills),
    experience: normalizedOriginal.experience.map((originalEntry, index) => {
      const entry =
        sortedWorkExperience.find((candidate) => candidate.sourceIndex === index) ??
        sortedWorkExperience[index];

      return {
        title:
          cleanTailoringString(entry?.tailoredRoleTitle) ||
          cleanTailoringString(entry?.originalRoleTitle) ||
          originalEntry.title ||
          "",
        company: originalEntry.company || cleanTailoringString(entry?.company),
        location: originalEntry.location || cleanTailoringString(entry?.location),
        startDate: originalEntry.startDate || cleanTailoringString(entry?.startDate),
        endDate: originalEntry.endDate || cleanTailoringString(entry?.endDate),
        description: cleanTailoringStringArray(entry?.bullets, 8),
      };
    }),
    education: Array.isArray(tailoredOutput.education)
      ? tailoredOutput.education.map((entry, index) => {
          const originalEntry = normalizedOriginal.education[index];
          const degree = combineEducationDegree(
            cleanTailoringString(entry.degree),
            cleanTailoringString(entry.field),
          );
          const year = combineEducationDates(
            cleanTailoringString(entry.startDate),
            cleanTailoringString(entry.endDate),
          );

          return {
            degree: degree || originalEntry?.degree || "",
            institution:
              originalEntry?.institution || cleanTailoringString(entry.school),
            year: originalEntry?.year || year,
          };
        })
      : [],
  });
}

// ── Deterministic fallback tailoring ─────────────────────────────────────────
// Used when AI tailoring fails with a non-quality error (network, timeout, JSON
// parse). Produces a locally-generated tailored resume that:
//   1. Rebuilds the summary around top JD keywords.
//   2. Rewrites the opening verb of every bullet and appends a JD-relevant phrase
//      to alternate bullets, so countMeaningfullyChangedBullets ≥ 2.
//   3. Pads each role to ≥ 5 bullets when the original had ≥ 2.
//   4. Reorders skills: JD-matching first.
// This is intentionally simple and keyword-centric; quality is lower than AI
// output but the task succeeds and users get a usable starting point.
export function tailorResumeFallback(
  resumeData: ParsedResumeData,
  jobDescription: string,
) {
  const normalizedResume = normalizeParsedResumeData(resumeData);
  const jdLower = jobDescription.toLowerCase();
  const keywords = extractKeywordCandidates(jobDescription, 30);
  const topKw = keywords.slice(0, 12);

  // ── 1. Skill reordering ────────────────────────────────────────────────────
  const existingSkills = normalizedResume.skills.map((s) => s.trim());
  const matchingSkills = existingSkills.filter((s) =>
    jdLower.includes(s.toLowerCase()),
  );
  const remainingSkills = existingSkills.filter(
    (s) => !matchingSkills.some((m) => m.toLowerCase() === s.toLowerCase()),
  );

  // ── 2. New summary ─────────────────────────────────────────────────────────
  const roleTitle =
    normalizedResume.experience[0]?.title ||
    normalizedResume.personalInfo.title ||
    "professional";
  const company = normalizedResume.experience[0]?.company;
  const kw0 = topKw[0] ?? "software engineering";
  const kw1 = topKw[1] ?? "technical delivery";
  const kw2 = topKw[2] ?? "problem solving";
  const kw3 = topKw[3] ?? kw0;
  const kw4 = topKw[4] ?? kw1;

  // Sentence 1 — identity anchor around the JD role
  const anchor = `${roleTitle}${company ? ` with experience at ${company}` : ""}, specializing in ${kw0} and ${kw1}.`;

  // Sentence 2 — reuse original summary body (first two sentences only)
  const originalSentences = normalizedResume.summary
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
  const body =
    originalSentences.slice(0, 2).join(" ").trim() ||
    `Proven track record of delivering ${kw2} solutions in cross-functional environments.`;

  // Sentence 3 — explicit JD alignment
  const closer = `Aligned with ${kw3} and ${kw4} requirements; eager to apply hands-on expertise to drive measurable outcomes.`;

  const newSummary = [anchor, body, closer].join(" ").trim();

  // ── 3. Bullet rewriting ───────────────────────────────────────────────────
  const ACTION_VERBS = [
    "Engineered",
    "Architected",
    "Delivered",
    "Optimized",
    "Implemented",
    "Designed",
    "Developed",
    "Built",
    "Launched",
    "Automated",
    "Scaled",
    "Streamlined",
    "Integrated",
    "Established",
    "Deployed",
  ];

  // Replace weak or generic opening verbs with a strong action verb.
  const WEAK_OPENER =
    /^(I |Worked on |Helped |Assisted |Participated in |Was responsible for |Responsible for |Contributed to |Involved in )/i;
  const VERB_OPENER = /^([A-Z][a-z]+(?:ed|ing|d)?)\s/;

  let verbCounter = 0;

  const rewriteBullet = (bullet: string, kw: string): string => {
    const verb = ACTION_VERBS[verbCounter++ % ACTION_VERBS.length];
    let b = bullet.replace(WEAK_OPENER, "");
    b = b.replace(VERB_OPENER, `${verb} `);
    // Ensure capital start
    b = b.charAt(0).toUpperCase() + b.slice(1);
    // Append JD context if no metric already present and kw not yet mentioned
    if (kw && !/\d/.test(b) && !b.toLowerCase().includes(kw.toLowerCase())) {
      b = `${b.replace(/[.,;]+$/, "")}, applying ${kw} practices to improve system reliability and team velocity`;
    }
    return b;
  };

  const enrichedExperience = normalizedResume.experience.map(
    (entry, entryIndex) => {
      if (entry.description.length === 0) return entry;

      const bullets = entry.description.map((bullet, bulletIndex) => {
        const kw = topKw[(entryIndex * 3 + bulletIndex) % Math.max(topKw.length, 1)] ?? "";
        // Rewrite first 3 bullets per role; keep the rest verbatim
        return bulletIndex < 3 ? rewriteBullet(bullet, kw) : bullet;
      });

      // Pad to ≥ 5 bullets when the original had ≥ 2 bullets
      while (entry.description.length >= 2 && bullets.length < 5) {
        const padKw1 = topKw[bullets.length % Math.max(topKw.length, 1)] ?? "engineering";
        const padKw2 = topKw[(bullets.length + 1) % Math.max(topKw.length, 1)] ?? "delivery";
        const padVerb = ACTION_VERBS[verbCounter++ % ACTION_VERBS.length];
        bullets.push(
          `${padVerb} ${padKw1} workflows and tooling to align with team standards and ${padKw2} objectives`,
        );
      }

      return { ...entry, description: bullets };
    },
  );

  return normalizeParsedResumeData({
    ...normalizedResume,
    summary: newSummary,
    skills: sanitizeTechnicalSkills([...matchingSkills, ...remainingSkills]),
    experience: enrichedExperience,
  });
}

function mergeTailoredResumeWithOriginal(
  originalResume: ParsedResumeData,
  tailoredResume: ParsedResumeData,
) {
  const normalizedOriginal = normalizeParsedResumeData(originalResume);
  const normalizedTailored = normalizeParsedResumeData(tailoredResume);

  // Allow AI-generated role title on the profile (the most visible tailoring signal).
  // All other personalInfo fields (name, email, phone, location, links) are locked to
  // the original so we never corrupt contact details.
  const tailoredTitle = normalizedTailored.personalInfo.title?.trim();

  return normalizeParsedResumeData({
    ...normalizedOriginal,
    personalInfo: {
      ...normalizedOriginal.personalInfo,
      title: tailoredTitle || normalizedOriginal.personalInfo.title,
    },
    summary: normalizedTailored.summary || normalizedOriginal.summary,
    skills: sanitizeTechnicalSkills(
      normalizedTailored.skills.length
        ? [
            ...normalizedTailored.skills,
            ...normalizedOriginal.skills.filter(
              (skill) =>
                !normalizedTailored.skills.some(
                  (tailoredSkill) =>
                    tailoredSkill.toLowerCase() === skill.toLowerCase(),
                ),
            ),
          ]
        : normalizedOriginal.skills,
    ),
    experience: normalizedOriginal.experience.map((originalEntry, index) => {
      // Match by position first, then by company name as fallback.
      const tailoredEntry =
        normalizedTailored.experience[index] ??
        normalizedTailored.experience.find(
          (entry) =>
            entry.company.toLowerCase() === originalEntry.company.toLowerCase(),
        );

      // Allow AI to rewrite the role title for each position (within the same company).
      // Dates, company name, and location are always locked to the original.
      const tailoredRoleTitle = tailoredEntry?.title?.trim();

      return {
        ...originalEntry,
        title: tailoredRoleTitle || originalEntry.title,
        description: tailoredEntry?.description.length
          ? tailoredEntry.description
          : originalEntry.description,
      };
    }),
    education: normalizedOriginal.education,
  });
}

function normalizePriorityToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

const PRIORITY_SKILL_ALIASES: Record<string, string[]> = {
  react: ["react", "react.js", "reactjs"],
  "react hooks": ["react hooks", "hooks"],
  "state management": ["state management", "redux", "zustand", "context api", "recoil"],
  "component architecture": ["component architecture", "component-based", "components"],
  "frontend architecture": ["frontend architecture", "front-end architecture", "modern frontend"],
  javascript: ["javascript", "js"],
  typescript: ["typescript", "ts"],
  "rest apis": ["rest api", "rest apis", "restful api", "api integration"],
  "async data flows": ["async data", "asynchronous", "promise", "fetch", "react query"],
  "frontend debugging": ["frontend debugging", "debugging", "bug fixing"],
  "performance optimization": ["performance optimization", "performance", "optimization"],
  refactoring: ["refactoring", "refactor", "legacy code"],
  "react native": ["react native"],
  java: ["java"],
  "spring boot": ["spring boot", "spring"],
  "restful services": ["restful services", "rest services", "rest api"],
  "api design": ["api design", "api integration", "service updates"],
  "agile/scrum": ["agile", "scrum", "sprint planning"],
};

function uniqueStrings(values: string[], limit = values.length) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const cleaned = cleanTailoringString(value);
    const key = normalizePriorityToken(cleaned);
    if (!cleaned || !key || seen.has(key)) continue;
    seen.add(key);
    unique.push(cleaned);
    if (unique.length >= limit) break;
  }

  return unique;
}

function buildTailoringPriorityTerms(
  jobDescription: string,
  analyzedJobDescription?: AnalyzedJobDescription,
) {
  const local = parseJobDescriptionSummary(jobDescription);
  const atsAnalysis = analyzedJobDescription?.atsAnalysis;
  const terms = [
    ...extractPriorityJobPhrases(jobDescription, 80),
    ...(analyzedJobDescription?.requiredSkills ?? local.requiredSkills),
    ...(analyzedJobDescription?.keywordPriorities ?? []),
    ...(atsAnalysis?.priorityKeywords ?? []),
    ...(analyzedJobDescription?.atsKeywords ?? []),
    ...(atsAnalysis?.atsKeywords ?? []),
    ...(analyzedJobDescription?.aboveTheFoldPriorities ?? []),
    ...(atsAnalysis?.aboveTheFoldPriorities ?? []),
    ...(analyzedJobDescription?.technicalSkills ?? []),
    ...(analyzedJobDescription?.preferredSkills ?? local.preferredSkills),
    ...(analyzedJobDescription?.technicalEnvironment ?? []),
    ...(analyzedJobDescription?.technicalEnvironmentDetails.languages ?? []),
    ...(analyzedJobDescription?.technicalEnvironmentDetails.frameworks ?? []),
    ...(analyzedJobDescription?.technicalEnvironmentDetails.cloud ?? []),
    ...(analyzedJobDescription?.technicalEnvironmentDetails.databases ?? []),
    ...(analyzedJobDescription?.technicalEnvironmentDetails.infrastructure ?? []),
    ...(analyzedJobDescription?.technicalEnvironmentDetails.tools ?? []),
    ...(analyzedJobDescription?.dataAndMlSkills ?? []),
    ...(analyzedJobDescription?.platformsAndTools ?? []),
    ...local.keywords,
    ...extractKeywordCandidates(jobDescription, 24),
  ];

  return uniqueStrings(terms.filter(isTechnicalSkill), 120);
}

function scoreAgainstPriority(value: string, priorityTerms: string[]) {
  const normalizedValue = normalizePriorityToken(value);
  if (!normalizedValue) return 0;

  for (const [index, term] of priorityTerms.entries()) {
    const normalizedTerm = normalizePriorityToken(term);
    if (!normalizedTerm) continue;

    if (
      normalizedValue === normalizedTerm ||
      normalizedValue.includes(normalizedTerm) ||
      normalizedTerm.includes(normalizedValue)
    ) {
      return 1000 - index * 4;
    }
  }

  return 0;
}

function reorderTailoredSkillsByJobPriority(
  skills: string[],
  jobDescription: string,
  analyzedJobDescription?: AnalyzedJobDescription,
  supportText = skills.join("\n"),
) {
  const priorityTerms = buildTailoringPriorityTerms(jobDescription, analyzedJobDescription);
  const skillsWithSupportedPriorities = addSupportedPrioritySkills(
    skills,
    priorityTerms,
    supportText,
  );
  const groups: Array<{ label: string; skills: string[]; firstIndex: number }> = [];
  const seen = new Set<string>();

  for (const [index, rawSkill] of skillsWithSupportedPriorities.entries()) {
    const { group, skill } = stripSkillGroupPrefix(rawSkill);
    const label = group || "Additional Skills";
    const normalizedSkill = skill.trim();
    const key = `${label}:${normalizedSkill}`.toLowerCase();
    if (!normalizedSkill || seen.has(key)) continue;
    seen.add(key);

    let target = groups.find((candidate) => candidate.label.toLowerCase() === label.toLowerCase());
    if (!target) {
      target = { label, skills: [], firstIndex: index };
      groups.push(target);
    }
    target.skills.push(normalizedSkill);
  }

  for (const group of groups) {
    group.skills.sort((left, right) => {
      const scoreDelta =
        scoreAgainstPriority(right, priorityTerms) - scoreAgainstPriority(left, priorityTerms);
      return scoreDelta || left.localeCompare(right);
    });
  }

  groups.sort((left, right) => {
    const leftScore = Math.max(
      scoreAgainstPriority(left.label, priorityTerms),
      ...left.skills.map((skill) => scoreAgainstPriority(skill, priorityTerms)),
    );
    const rightScore = Math.max(
      scoreAgainstPriority(right.label, priorityTerms),
      ...right.skills.map((skill) => scoreAgainstPriority(skill, priorityTerms)),
    );

    return rightScore - leftScore || left.firstIndex - right.firstIndex;
  });

  return groups.flatMap((group) => group.skills.map((skill) => prefixSkillWithGroup(group.label, skill)));
}

function isTermSupportedBySkillInventory(term: string, supportText: string) {
  const key = normalizePriorityToken(term);
  const aliases = PRIORITY_SKILL_ALIASES[key] ?? [term];

  return aliases.some((alias) => {
    const normalizedAlias = normalizePriorityToken(alias);
    if (!normalizedAlias) return false;
    if (normalizedAlias === "java") {
      return /\bjava\b(?!script)/i.test(supportText);
    }
    if (normalizedAlias === "js") {
      return /\b(?:js|javascript)\b/i.test(supportText);
    }
    if (normalizedAlias === "ts") {
      return /\b(?:ts|typescript)\b/i.test(supportText);
    }

    return new RegExp(`\\b${normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i").test(
      supportText,
    );
  });
}

function addSupportedPrioritySkills(
  skills: string[],
  priorityTerms: string[],
  supportText: string,
) {
  const existingKeys = new Set(skills.map((skill) => technicalSkillKey(skill)));
  const normalizedSupportText = supportText.toLowerCase();
  const additions: string[] = [];

  for (const term of priorityTerms.slice(0, 36)) {
    const key = technicalSkillKey(term);
    if (!key || existingKeys.has(key)) continue;
    if (!isTechnicalSkill(term)) continue;
    if (!isTermSupportedBySkillInventory(term, normalizedSupportText)) continue;
    const label = classifyTechnicalSkillGroup(term);
    additions.push(prefixSkillWithGroup(label, term));
    existingKeys.add(key);
  }

  return sanitizeTechnicalSkills([...additions, ...skills]);
}

function buildResumeKeywordSupportText(resumeData: ParsedResumeData) {
  const normalized = normalizeParsedResumeData(resumeData);
  return [
    normalized.personalInfo.title,
    normalized.summary,
    ...normalized.skills,
    ...normalized.experience.flatMap((entry) => [
      entry.title,
      entry.company,
      ...entry.description,
    ]),
    ...normalized.education.flatMap((entry) => [
      entry.degree,
      entry.institution,
      entry.year,
    ]),
  ].join("\n");
}

function polishTailoredResumeByJobPriority(
  tailoredResume: ParsedResumeData,
  jobDescription: string,
  analyzedJobDescription?: AnalyzedJobDescription,
) {
  const normalized = normalizeParsedResumeData(tailoredResume);

  return normalizeParsedResumeData({
    ...normalized,
    skills: reorderTailoredSkillsByJobPriority(
      normalized.skills,
      jobDescription,
      analyzedJobDescription,
      buildResumeKeywordSupportText(normalized),
    ),
  });
}

// 0.55 produces clearly different bullet phrasing while staying factually grounded.
// Lower values (≤0.4) cause the model to reproduce original bullets near-verbatim,
// which fails the quality gate that requires ≥2 meaningfully changed bullets.
const TAILORING_TEMPERATURE = 0.55;

export async function analyzeJobDescriptionWithAI(
  jobDescription: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  options: AIExecutionOptions = {},
) {
  const prompt = buildJobDescriptionAnalysisPrompt(
    jobDescription,
    parseJobDescriptionSummary(jobDescription),
  );

  try {
    const response =
      provider === "openai"
        ? await callOpenAIJson<AnalyzedJobDescription>(
            prompt,
            analyzedJobDescriptionJsonSchema,
            "job_description_analysis",
            6000,
            { temperature: 0.15 },
          )
        : provider === "anthropic"
        ? await callAnthropicJson<AnalyzedJobDescription>(prompt, 6000)
        : provider === "huggingface"
          ? await callHuggingFaceJson<AnalyzedJobDescription>(
              prompt,
              6000,
              { preferredRouterIndex: options.huggingFaceRouterIndex },
            )
          : await callGeminiJson<AnalyzedJobDescription>(
              prompt,
              analyzedJobDescriptionSchema,
              6000,
              {
                preferredRouterIndex: options.geminiRouterIndex,
                temperature: 0.15,
              },
            );

    return normalizeAnalyzedJobDescription(response, jobDescription);
  } catch (error) {
    console.warn(`${provider} job description analysis failed, using local analysis.`, error);
    const fallbackAnalysis = normalizeAnalyzedJobDescription(null, jobDescription, {});
    return {
      ...fallbackAnalysis,
      warnings: [
        ...fallbackAnalysis.warnings,
        `${provider} job description analysis failed; local deterministic analysis was used.`,
      ],
    };
  }
}

export async function tailorResume(
  resumeData: ParsedResumeData,
  jobDescription: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  options: AIExecutionOptions = {},
  context: {
    analyzedJobDescription?: AnalyzedJobDescription;
    resumeAnalysisReport?: ResumeAnalysisReport;
    originalResumeContext?: unknown;
  } = {},
) {
  if (provider === "huggingface") {
    const response = await callHuggingFaceJsonWithMessages<ParsedResumeData>(
      getHuggingFaceResumeTailoringInstructions(),
      buildHuggingFaceResumeTailoringUserMessage(resumeData, jobDescription, context),
      HUGGINGFACE_TAILORED_RESUME_OUTPUT_TOKENS,
      {
        preferredRouterIndex: options.huggingFaceRouterIndex,
        temperature: TAILORING_TEMPERATURE,
      },
    );
    const tailoredResume = polishTailoredResumeByJobPriority(
      mergeTailoredResumeWithOriginal(
        resumeData,
        normalizeParsedResumeData(response),
      ),
      jobDescription,
      context.analyzedJobDescription,
    );
    return tailoredResume;
  }

  const prompt = buildResumeTailoringPrompt(resumeData, jobDescription, context);
  const response =
    provider === "openai"
      ? await callOpenAIJson<TailoredResumeOutput>(
          prompt,
          tailoredResumeJsonSchema,
          "tailored_resume",
          TAILORED_RESUME_OUTPUT_TOKENS,
          { temperature: TAILORING_TEMPERATURE },
        )
      : provider === "anthropic"
      ? await callAnthropicJson<TailoredResumeOutput>(
          prompt,
          TAILORED_RESUME_OUTPUT_TOKENS,
        )
      : await callGeminiJson<TailoredResumeOutput>(
            prompt,
            tailoredResumeSchema,
            TAILORED_RESUME_OUTPUT_TOKENS,
            { preferredRouterIndex: options.geminiRouterIndex, temperature: TAILORING_TEMPERATURE },
          );

  const tailoredResume = polishTailoredResumeByJobPriority(
    mergeTailoredResumeWithOriginal(
      resumeData,
      convertTailoredOutputToParsedResumeData(resumeData, response),
    ),
    jobDescription,
    context.analyzedJobDescription,
  );
  return tailoredResume;
}

function buildCoverLetterPrompt(
  resumeData: ParsedResumeData,
  jobDescription: string,
) {
  return [
    "Write a professional cover letter for the candidate based on their resume and the job description below.",
    "The cover letter should be concise, highlight relevant experience and skills, and express enthusiasm for the role.",
    "Use the candidate's name and contact information from the resume.",
    "Return only the cover letter as plain text with paragraph breaks.",
    "",
    "Resume:",
    JSON.stringify(resumeData, null, 2),
    "",
    "Job Description:",
    clipResumeText(jobDescription),
  ].join("\n");
}

export function generateCoverLetterFallback(
  resumeData: ParsedResumeData,
  jobDescription: string,
) {
  const keywords = extractKeywordCandidates(jobDescription, 6);
  const latestExperience = resumeData.experience[0];
  const introName = resumeData.personalInfo.name || "Hiring Team";
  const summarySentence =
    resumeData.summary ||
    "I bring hands-on experience delivering measurable results across cross-functional teams.";
  const experienceSentence = latestExperience
    ? `In my recent ${latestExperience.title || "role"}${
        latestExperience.company ? ` at ${latestExperience.company}` : ""
      }, I focused on ${latestExperience.description[0] || "high-impact work with clear outcomes"}.`
    : "My background includes building strong execution habits and collaborative delivery skills.";
  const keywordSentence = keywords.length
    ? `I am especially excited by your emphasis on ${keywords.slice(0, 3).join(", ")} and would welcome the chance to contribute in those areas.`
    : "I would welcome the chance to contribute my experience to your team and help drive meaningful results.";

  return [
    "Dear Hiring Team,",
    "",
    `My name is ${introName}, and I am excited to apply for this opportunity. ${summarySentence}`,
    "",
    experienceSentence,
    "",
    keywordSentence,
    "",
    "Thank you for your time and consideration. I would be glad to discuss how my experience could support your team.",
    "",
    "Sincerely,",
    resumeData.personalInfo.name || "Your Candidate",
  ].join("\n");
}

export async function generateCoverLetter(
  resumeData: ParsedResumeData,
  jobDescription: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  options: AIExecutionOptions = {},
) {
  const prompt = buildCoverLetterPrompt(resumeData, jobDescription);
  const response =
    provider === "openai"
      ? await callOpenAI(prompt, {
          maxOutputTokens: 1200,
          temperature: 0.5,
          text: {
            verbosity: "medium",
          },
          stream: true,
        })
      : provider === "anthropic"
      ? await callAnthropic(prompt, { maxOutputTokens: 1200 })
      : provider === "huggingface"
        ? await callHuggingFace(prompt, {
            maxOutputTokens: 1200,
            temperature: 0.5,
            preferredRouterIndex: options.huggingFaceRouterIndex,
          })
      : await callGemini(prompt, {
          maxOutputTokens: 1200,
          preferredRouterIndex: options.geminiRouterIndex,
          temperature: 0.5,
        });

  return response.trim();
}

export type AssistantContext = {
  currentPath?: string;
  membershipTier?: string;
  resumeData?: ParsedResumeData | null;
  jobDescription?: string | null;
  generationLabel?: string | null;
};

function summarizeAssistantContext(context: AssistantContext) {
  const blocks: string[] = [];

  if (context.currentPath) {
    blocks.push(`Current app area: ${context.currentPath}`);
  }

  if (context.membershipTier) {
    blocks.push(`Membership tier: ${context.membershipTier}`);
  }

  if (context.generationLabel) {
    blocks.push(`Current generation: ${context.generationLabel}`);
  }

  if (context.resumeData) {
    blocks.push(
      `Resume data:\n${JSON.stringify(context.resumeData, null, 2).slice(
        0,
        MAX_ASSISTANT_PROMPT_CHARS,
      )}`,
    );
  }

  if (context.jobDescription) {
    blocks.push(
      `Job description:\n${clipResumeText(context.jobDescription).slice(
        0,
        MAX_ASSISTANT_PROMPT_CHARS,
      )}`,
    );
  }

  return blocks.join("\n\n");
}

function buildAssistantPrompt(message: string, context: AssistantContext) {
  return [
    "You are Resume Foundry's conversational AI assistant.",
    "You are a practical, encouraging resume coach and product guide.",
    "Help the user improve resumes, cover letters, tailoring strategy, and understand how to use the app.",
    "Keep answers concise but useful. Prefer specific advice over generic platitudes.",
    "If the user asks for platform help, explain the likely next step in the current workflow.",
    "",
    "Context:",
    summarizeAssistantContext(context) || "No additional context supplied.",
    "",
    "User message:",
    message.trim().slice(0, MAX_ASSISTANT_PROMPT_CHARS),
  ].join("\n");
}

export function askAssistantFallback(
  message: string,
  context: AssistantContext,
) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("cover letter")) {
    return "Start by anchoring the letter to one or two experiences that match the role, then explain why this company or team is a strong fit.";
  }

  if (normalizedMessage.includes("compare")) {
    return "Compare the skills mix, the first bullet under your latest role, and whether the summary mirrors the target job language without sounding copied.";
  }

  if (normalizedMessage.includes("share")) {
    return "A public link works best once the resume has a clean design and only the information you are comfortable exposing publicly.";
  }

  if (context.resumeData) {
    const topSkills = context.resumeData.skills.slice(0, 4).join(", ");

    return topSkills
      ? `Your current resume already emphasizes ${topSkills}. I would focus next on tightening the summary and making the latest experience bullets mirror the job's highest-priority requirements.`
      : "I would start by strengthening the summary and making sure each recent experience entry leads with a concrete, outcome-focused bullet.";
  }

  return "Focus on clarity first: align your summary and top skills to the role, keep recent experience specific, and use the design or comparison tools once the content feels targeted.";
}

export async function askAssistant(
  message: string,
  context: AssistantContext,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  options: AIExecutionOptions = {},
) {
  const prompt = buildAssistantPrompt(message, context);
  const response =
    provider === "openai"
      ? await callOpenAI(prompt, {
          maxOutputTokens: 900,
          temperature: 0.6,
          text: {
            verbosity: "medium",
          },
          stream: true,
        })
      : provider === "anthropic"
      ? await callAnthropic(prompt, { maxOutputTokens: 900 })
      : provider === "huggingface"
        ? await callHuggingFace(prompt, {
            maxOutputTokens: 900,
            temperature: 0.6,
            preferredRouterIndex: options.huggingFaceRouterIndex,
          })
      : await callGemini(prompt, {
          maxOutputTokens: 900,
          preferredRouterIndex: options.geminiRouterIndex,
          temperature: 0.6,
        });

  return response.trim();
}
