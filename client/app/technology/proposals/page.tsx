import ManagerShell from "../../../components/ManagerShell"
import TechnologyProposalReview from "../../../components/TechnologyProposalReview"
import { t } from "../../../i18n"

// Technology Update Proposals (screen A11) — the human-approval gate. Approving
// here is the only way a change reaches the Technology Knowledge Base.

export default function TechnologyProposalsPage() {
  return (
    <ManagerShell
      breadcrumbs={[{ label: t("technology.library.title"), href: "/technology" }]}
      title={t("technology.proposals.title")}
      description={t("technology.proposals.intro")}
    >
      <TechnologyProposalReview />
    </ManagerShell>
  )
}
