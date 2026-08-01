import KnowledgeBrowser from "../../components/KnowledgeBrowser"
import ManagerShell from "../../components/ManagerShell"
import { t } from "../../i18n"

// The Consulting Knowledge Base is its own authorized route, not a stage of an
// engagement: it is the material an assessment is grounded in, shared across
// every engagement in the workspace. It therefore sits in the same internal
// shell as every other consultant surface, with the sidebar entry that leads
// here marked as current.

export default function KnowledgePage() {
  return (
    <ManagerShell
      title={t("knowledge.browser.title")}
      description={t("knowledge.browser.intro")}
    >
      <KnowledgeBrowser />
    </ManagerShell>
  )
}
