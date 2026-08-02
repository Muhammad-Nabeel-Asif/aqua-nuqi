; Custom NSIS uninstall: optional "also delete my business data" prompt.
; Default is NO — data in %APPDATA%\Aqua Nuqi survives uninstall.
; When installing an update, electron-builder passes --updated and we skip
; this branch entirely (${IfNot} ${isUpdated}).

!macro customUnInstall
  ${IfNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 \
      "Also delete my business data?$\r$\n$\r$\nThis permanently removes customers, deliveries, invoices, backups and attachments in:$\r$\n$APPDATA\Aqua Nuqi$\r$\n$\r$\nThis cannot be undone. Choose No unless you have a verified backup elsewhere." \
      IDYES delete_data IDNO keep_data
    delete_data:
      RMDir /r "$APPDATA\Aqua Nuqi"
    keep_data:
  ${EndIf}
!macroend
