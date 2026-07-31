import type { AuthenticatedIdentity } from "./access.js"

// The two infrastructure boundaries the access side depends on
// (architecture.md §3 "Ports", §7A.1). They are declared here, toward the
// domain, and implemented in `lib/` — so replacing the identity mechanism or
// the mail vendor later changes an adapter, not the authorization rules.
//
// Both are expressed in plain data. No Express, no provider SDK, no
// `process.env` reaches this file.

// `AuthenticationProvider` — establishes *who is acting*, and owns everything
// about how that is proven: password creation and verification, sessions, email
// verification, and password reset. Better Auth is the initial implementation.
//
// The consulting domain asks it one question — "who is this?" — and never sees
// a password.
export type AuthenticationProvider = {
  // Resolve the caller from the credential material their request carried.
  // Returns null when the request carries no valid session at all.
  resolveIdentity: (
    credentials: RequestCredentials,
  ) => Promise<AuthenticatedIdentity | null>

  // Create an authentication identity with a password the person chooses
  // themselves. Used by client self-registration, staff invitation acceptance,
  // and the first-administrator bootstrap — the three documented ways an
  // account comes into existence.
  registerIdentity: (input: {
    email: string
    name: string
    password: string
  }) => Promise<AuthIdentityResult>

  // Verify a password and start a session.
  startSession: (input: {
    email: string
    password: string
  }) => Promise<AuthSessionResult>

  // End the caller's session.
  endSession: (credentials: RequestCredentials) => Promise<AuthHeaders>

  // Send (or re-send) the address-confirmation email for an identity.
  sendVerification: (input: { email: string }) => Promise<void>

  // Mark an identity's address as confirmed without an email round-trip. Used
  // only where confirmation is already established by other means: the
  // bootstrap secret, and an invitation link that was delivered to that address.
  confirmEmail: (input: { authUserId: string }) => Promise<void>

  // Look up an identity by address, without a session. Needed by exactly one
  // consulting-side decision: associating an already self-registered client
  // with an engagement's Discovery requires knowing whether that person has an
  // account and has confirmed their address.
  resolveIdentityByEmail: (email: string) => Promise<IdentitySummary | null>

  // How many identities exist. The bootstrap gate asks this to establish that
  // nobody can sign in yet.
  countIdentities: () => Promise<number>
}

export type IdentitySummary = {
  authUserId: string
  email: string
  name: string
  emailVerified: boolean
}

// The credential material a request carried, as plain data. Kept as a header
// map rather than a framework request so the port stays transport-agnostic.
export type RequestCredentials = {
  headers: Record<string, string | undefined>
}

// Headers the provider wants set on the response — session cookies, chiefly.
// The interface layer applies them; no inner layer knows what they mean.
export type AuthHeaders = readonly (readonly [name: string, value: string])[]

export type AuthIdentityResult =
  | { success: true; authUserId: string; setHeaders: AuthHeaders }
  | { success: false; error: AuthProviderError }

export type AuthSessionResult =
  | { success: true; authUserId: string; setHeaders: AuthHeaders }
  | { success: false; error: AuthProviderError }

// Why the provider refused, as an identifier the interface layer maps to a
// status and the frontend maps to a message — never as prose
// (coding-standards.md §12A).
export type AuthProviderError =
  | "invalid_credentials"
  | "email_already_registered"
  | "email_not_verified"
  | "password_too_weak"
  | "provider_unavailable"

// `EmailDeliveryProvider` — carries verification, reset, and invitation mail.
// Resend is the initial implementation. Delivery is separate from the
// consulting domain and from the authentication provider itself.
export type EmailDeliveryProvider = {
  send: (message: EmailMessage) => Promise<EmailDeliveryResult>
  // Which adapter is active, so the interface layer can report honestly in
  // development that mail was logged rather than sent.
  readonly channel: EmailChannel
}

// The message as it will be handed to the vendor. `html` and `text` are the
// message *body*: they carry verification links, reset links, and invitation
// tokens, and are therefore never logged, echoed, or put in an error
// (coding-standards.md §6A — authentication material stays inside the auth
// boundary).
export type EmailMessage = {
  to: string
  subject: string
  html: string
  text: string
}

// Which adapter carried the message. Only `resend` sends; the other two are
// development surfaces and are named separately so a caller can report honestly
// which one it was — "written to a local mailbox a developer can open" and
// "counted in a log line and gone" are different states to be in.
export type EmailChannel = "resend" | "log" | "dev_mailbox"

// What actually happened to the message. `delivered: true` is restricted to the
// `resend` channel by construction: the development log adapter cannot report a
// delivery it did not perform, and no future adapter can be added that does.
export type EmailDeliveryResult =
  | { delivered: true; channel: "resend"; id: string | null }
  | { delivered: false; channel: EmailChannel; reason: EmailDeliveryFailure }

// Why nothing reached the recipient, as an identifier rather than prose
// (coding-standards.md §12A). Vendor error text is diagnostic, not a message
// identifier, so it stays out of this contract.
export type EmailDeliveryFailure =
  // The development log adapter ran: nothing left the process. This is a
  // configuration state, not an outage, and it is never reported as delivery.
  | "logged_not_sent"
  // The development mailbox took the message: nothing left the process either,
  // but the developer can read it locally. Also a configuration state.
  | "stored_in_dev_mailbox"
  // The vendor accepted the request and refused the message.
  | "provider_rejected"
  // The call to the vendor itself failed.
  | "provider_unavailable"
