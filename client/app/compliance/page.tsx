import CompliancePanel from "../../components/CompliancePanel"
import ManagerShell from "../../components/ManagerShell"
import { t } from "../../i18n"

// Security, Privacy & AI Compliance. It is workspace-level governance rather
// than a stage of any engagement, so it sits in the same internal shell as the
// other workspace surfaces with its own sidebar entry.

export default function CompliancePage() {
  return (
    <ManagerShell
      title={t("compliance.page.title")}
      description={t("compliance.page.intro")}
    >
      <CompliancePanel />
    </ManagerShell>
  )
}
