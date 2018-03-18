set PATH=c:\Program Files (x86)\7-Zip;c:\Program Files\7-Zip;d:\Program Files (x86)\7-Zip;d:\Program Files\7-Zip
set zip=7z.exe a -tzip -mx1 -r
set AllFiles=content locale skin modules chrome.manifest icon.png install.rdf
del gmailui-*-tb.xpi
%zip% gmailui-1.3-tb.xpi %AllFiles% -xr!.svn
