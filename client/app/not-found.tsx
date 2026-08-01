import Link from "next/link"

import PublicShell from "../components/PublicShell"
import { EmptyState, buttonStyle, mutedTextStyle } from "../components/UiKit"
import { t } from "../i18n"

// The address that does not exist.
//
// This state was always reachable — any mistyped URL lands here — but it was
// served by the framework's own bare page, in a different font, on a white
// background, with an English sentence and no way onward. It now belongs to the
// product: same shell, same tokens, one link back.
//
// It deliberately says nothing about what does exist. Which engagement
// identifiers are real is not something an unknown address should reveal
// (architecture.md §7A.4).

export default function NotFound() {
  return (
    <PublicShell title={t("not_found.title")}>
      <EmptyState>
        <p style={mutedTextStyle}>{t("not_found.hint")}</p>
        <p>
          <Link href="/" style={buttonStyle("secondary")}>
            {t("not_found.action")}
          </Link>
        </p>
      </EmptyState>
    </PublicShell>
  )
}
