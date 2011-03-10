set PATH=c:\Program Files\7-Zip;%PATH%
set zip=7z.exe a -tzip -r

set ChromeFiles=content locale skin
set AllFiles=chrome defaults modules chrome.manifest icon.png install.rdf

del chrome\*.jar
del gmailui-*-tb.xpi
%zip% t.zip %ChromeFiles% -x!.svn
mv t.zip chrome/expressionsearch.jar
%zip% gmailui-0.7-tb.xpi %AllFiles% -xr!.svn
