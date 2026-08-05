import type {
  PersonalIdentifierKind,
  PersonalIdentifierRule,
} from "../../shared/compliance.schema"

export type IdentifierPreviewMatch = {
  kind: PersonalIdentifierKind
  count: number
}

export type PreviewIdentifierRules = (
  text: string,
  rules: PersonalIdentifierRule[],
) => Promise<IdentifierPreviewMatch[]>
