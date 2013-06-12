set PATH=c:\Program Files (x86)\7-Zip;c:\Program Files\7-Zip;d:\Program Files (x86)\7-Zip;d:\Program Files\7-Zip
set zip=7z.exe a -tzip -mx1 -r
set AllFiles=content locale skin defaults modules chrome.manifest icon.png install.rdf
del gmailui-*-tb.xpi
%zip% gmailui-0.8.6-tb.xpi %AllFiles% -xr!.svn
