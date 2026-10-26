export * as Generate from "./generate.js"

import { Schema } from "effect"
import { Model } from "./model.js"
import { PositiveInt, optional } from "./schema.js"

const description = (text: string) => ({ description: text })

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export interface Base64Media extends Schema.Schema.Type<typeof Base64Media> {}
export const Base64Media = Schema.Struct({
  type: Schema.Literal("base64"),
  mediaType: Schema.String.annotate(description("IANA media type, for example image/png")),
  data: Schema.String.annotate(description("Base64 payload without a data: URL prefix")),
}).annotate({ identifier: "Generate.Base64Media" })

export interface UrlMedia extends Schema.Schema.Type<typeof UrlMedia> {}
export const UrlMedia = Schema.Struct({
  type: Schema.Literal("url"),
  url: Schema.String.annotate(description("http(s) URL the server downloads before calling the provider")),
  mediaType: Schema.String.pipe(optional),
}).annotate({ identifier: "Generate.UrlMedia" })

export type Media = Base64Media | UrlMedia
export const Media = Schema.Union([Base64Media, UrlMedia]).annotate({ identifier: "Generate.Media" })

export const ProviderOptions = Schema.Record(Schema.String, Schema.Json).annotate({
  identifier: "Generate.ProviderOptions",
  description: "Options passed through to the resolved provider unchanged",
})
export type ProviderOptions = typeof ProviderOptions.Type

export const ProviderMetadata = Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Json)).annotate({
  identifier: "Generate.ProviderMetadata",
  description: "Provider-specific response details, keyed by provider",
})
export type ProviderMetadata = typeof ProviderMetadata.Type

export interface TokenUsage extends Schema.Schema.Type<typeof TokenUsage> {}
export const TokenUsage = Schema.Struct({
  inputTokens: Schema.Finite.pipe(optional),
  outputTokens: Schema.Finite.pipe(optional),
  totalTokens: Schema.Finite.pipe(optional),
  cost: Schema.Finite.pipe(optional).annotate(description("USD the provider reported charging, when it reports one")),
}).annotate({ identifier: "Generate.TokenUsage" })

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

export interface ImageRequest extends Schema.Schema.Type<typeof ImageRequest> {}
export const ImageRequest = Schema.Struct({
  model: Model.Ref,
  prompt: Schema.String,
  images: Schema.Array(Media)
    .pipe(optional)
    .annotate(description("Edit sources or style and subject references, in order")),
  n: PositiveInt.pipe(optional).annotate(description("Number of images to generate; defaults to 1")),
  aspect: Schema.String.check(Schema.isPattern(/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/))
    .pipe(optional)
    .annotate(description("Aspect ratio as width:height, for example 16:9")),
  resolution: Schema.String.pipe(optional).annotate(
    description("Size tier such as 1K, 2K or 4K; 1K is about as many pixels as 1024x1024 at the requested aspect"),
  ),
  providerOptions: ProviderOptions.pipe(optional),
}).annotate({ identifier: "Generate.ImageRequest" })

export const MediaUsage = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("tokens"),
    input: Schema.Finite.pipe(optional),
    output: Schema.Finite.pipe(optional),
    total: Schema.Finite.pipe(optional),
  }),
  Schema.Struct({ type: Schema.Literal("credits"), credits: Schema.Finite }),
  Schema.Struct({ type: Schema.Literal("compute"), seconds: Schema.Finite }),
]).annotate({ identifier: "Generate.MediaUsage", description: "How the provider metered the request" })
export type MediaUsage = typeof MediaUsage.Type

export interface Notice extends Schema.Schema.Type<typeof Notice> {}
export const Notice = Schema.Struct({
  type: Schema.Literals(["moderated", "filtered", "other"]),
  message: Schema.String,
}).annotate({
  identifier: "Generate.Notice",
  description: "A partial result the provider reported, such as fewer images than requested after moderation",
})

export interface ImageResult extends Schema.Schema.Type<typeof ImageResult> {}
export const ImageResult = Schema.Struct({
  images: Schema.Array(Base64Media),
  usage: MediaUsage.pipe(optional),
  notices: Schema.Array(Notice).pipe(optional),
  providerMetadata: ProviderMetadata.pipe(optional),
}).annotate({ identifier: "Generate.ImageResult" })

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export interface DecisionTextPart extends Schema.Schema.Type<typeof DecisionTextPart> {}
export const DecisionTextPart = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }).annotate({
  identifier: "Generate.DecisionTextPart",
})

export interface DecisionJsonPart extends Schema.Schema.Type<typeof DecisionJsonPart> {}
export const DecisionJsonPart = Schema.Struct({ type: Schema.Literal("json"), value: Schema.Json }).annotate({
  identifier: "Generate.DecisionJsonPart",
})

export interface DecisionMediaPart extends Schema.Schema.Type<typeof DecisionMediaPart> {}
export const DecisionMediaPart = Schema.Struct({
  type: Schema.Literal("media"),
  media: Media,
  filename: Schema.String.pipe(optional),
}).annotate({ identifier: "Generate.DecisionMediaPart" })

export type DecisionPart = DecisionTextPart | DecisionJsonPart | DecisionMediaPart
export const DecisionPart = Schema.Union([DecisionTextPart, DecisionJsonPart, DecisionMediaPart]).annotate({
  identifier: "Generate.DecisionPart",
})

export const ChoiceValue = Schema.Union([Schema.String, Schema.Boolean]).annotate({
  identifier: "Generate.ChoiceValue",
  description: 'Choice values are typed: true and "true" are different values',
})
export type ChoiceValue = typeof ChoiceValue.Type

const QuestionName = Schema.String.annotate(description("Unique within the request; echoed on the matching answer"))

export interface PredicateQuestion extends Schema.Schema.Type<typeof PredicateQuestion> {}
export const PredicateQuestion = Schema.Struct({
  type: Schema.Literal("predicate"),
  name: QuestionName,
  instructions: Schema.String,
}).annotate({ identifier: "Generate.PredicateQuestion", description: "The probability that a statement is true" })

export interface ChoiceQuestion extends Schema.Schema.Type<typeof ChoiceQuestion> {}
export const ChoiceQuestion = Schema.Struct({
  type: Schema.Literal("choice"),
  name: QuestionName,
  instructions: Schema.String,
  choices: Schema.Array(Schema.Struct({ value: ChoiceValue, description: Schema.String.pipe(optional) })).check(
    Schema.isMinLength(1),
  ),
}).annotate({ identifier: "Generate.ChoiceQuestion", description: "Pick one value from a fixed set" })

export interface ScoreQuestion extends Schema.Schema.Type<typeof ScoreQuestion> {}
export const ScoreQuestion = Schema.Struct({
  type: Schema.Literal("score"),
  name: QuestionName,
  instructions: Schema.String,
  levels: Schema.Array(Schema.Struct({ label: Schema.String, description: Schema.String.pipe(optional) })).check(
    Schema.isMinLength(1),
  ),
}).annotate({ identifier: "Generate.ScoreQuestion", description: "Place the input on ordered levels, lowest first" })

export type DecisionQuestion = PredicateQuestion | ChoiceQuestion | ScoreQuestion
export const DecisionQuestion = Schema.Union([PredicateQuestion, ChoiceQuestion, ScoreQuestion]).annotate({
  identifier: "Generate.DecisionQuestion",
})

export interface DecisionRequest extends Schema.Schema.Type<typeof DecisionRequest> {}
export const DecisionRequest = Schema.Struct({
  model: Model.Ref,
  input: Schema.Array(DecisionPart).annotate(description("The evidence every question is asked about, in order")),
  questions: Schema.Array(DecisionQuestion).pipe(
    Schema.check(Schema.isMinLength(1)),
    Schema.refine((x): x is typeof x => new Set(x.map((question) => question.name)).size === x.length, {
      message: "Decision question names must be unique",
    }),
  ),
  providerOptions: ProviderOptions.pipe(optional),
}).annotate({ identifier: "Generate.DecisionRequest" })

const Probability = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))

export interface PredicateAnswer extends Schema.Schema.Type<typeof PredicateAnswer> {}
export const PredicateAnswer = Schema.Struct({
  type: Schema.Literal("predicate"),
  name: Schema.String,
  probability: Probability,
}).annotate({ identifier: "Generate.PredicateAnswer" })

export interface ChoiceAnswer extends Schema.Schema.Type<typeof ChoiceAnswer> {}
export const ChoiceAnswer = Schema.Struct({
  type: Schema.Literal("choice"),
  name: Schema.String,
  choice: ChoiceValue,
  probabilities: Schema.Array(Schema.Struct({ value: ChoiceValue, probability: Probability })),
  confidence: Probability,
}).annotate({ identifier: "Generate.ChoiceAnswer" })

export interface ScoreAnswer extends Schema.Schema.Type<typeof ScoreAnswer> {}
export const ScoreAnswer = Schema.Struct({
  type: Schema.Literal("score"),
  name: Schema.String,
  score: Schema.Finite.annotate(description("Probability-weighted level index, so it can fall between levels")),
  probabilities: Schema.Array(Schema.Struct({ value: Schema.Int, label: Schema.String, probability: Probability })),
  confidence: Probability,
}).annotate({ identifier: "Generate.ScoreAnswer" })

export interface ErrorAnswer extends Schema.Schema.Type<typeof ErrorAnswer> {}
export const ErrorAnswer = Schema.Struct({
  type: Schema.Literal("error"),
  name: Schema.String,
  reason: Schema.Literal("refusal"),
}).annotate({
  identifier: "Generate.ErrorAnswer",
  description: "The provider declined this one question; the other answers still came back",
})

export type DecisionAnswer = PredicateAnswer | ChoiceAnswer | ScoreAnswer | ErrorAnswer
export const DecisionAnswer = Schema.Union([PredicateAnswer, ChoiceAnswer, ScoreAnswer, ErrorAnswer]).annotate({
  identifier: "Generate.DecisionAnswer",
})

export interface DecisionResult extends Schema.Schema.Type<typeof DecisionResult> {}
export const DecisionResult = Schema.Struct({
  answers: Schema.Array(DecisionAnswer).annotate(description("One answer per question, in question order")),
  usage: TokenUsage.pipe(optional),
  providerMetadata: ProviderMetadata.pipe(optional),
}).annotate({ identifier: "Generate.DecisionResult" })
