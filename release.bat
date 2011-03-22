set zip="c:\Program Files\7-Zip\7z.exe" a -tzip -r
set AllFiles=content locale skin defaults modules chrome.manifest icon.png install.rdf
del gmailui-*-tb.xpi
%zip% gmailui-0.8beta-tb.xpi %AllFiles% -xr!.svn
