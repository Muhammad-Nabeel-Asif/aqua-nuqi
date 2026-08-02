/** Stable install policy — unit-tested so auto-quit never skips the pre-update backup. */
export const UPDATER_INSTALL_POLICY = {
  channel: 'latest' as const,
  allowPrerelease: false,
  autoInstallOnAppQuit: false,
}
