!macro customInstall
  ; Runs for this user. Windows validates MSIX trust; certificates are never imported here.
  ExecWait '"$INSTDIR\resources\windows-share\AcceptCat.ShareTarget.exe" --register "$INSTDIR"' $0
!macroend
!macro customUnInstall
  ExecWait '"$INSTDIR\resources\windows-share\AcceptCat.ShareTarget.exe" --unregister' $0
!macroend
