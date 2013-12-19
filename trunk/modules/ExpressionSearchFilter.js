// Opera Wang, 2011/3/24
// GPL V3 / MPL
// Expression Search Filter
// MessageTextFilter didn't want me to extend it much, so I have to define mine.
"use strict";

var EXPORTED_SYMBOLS = ["ExperssionSearchFilter", "ExpressionSearchVariable"];

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
const { nsMsgSearchAttrib: nsMsgSearchAttrib, nsMsgSearchOp: nsMsgSearchOp, nsMsgMessageFlags: nsMsgMessageFlags, nsMsgSearchScope: nsMsgSearchScope } = Ci;
Cu.import("resource://expressionsearch/log.js");
Cu.import("resource://gre/modules/quickFilterManager.js");
Cu.import("resource://expressionsearch/gmailuiParse.js");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource:///modules/mailServices.js");
Cu.import("resource:///modules/gloda/utils.js"); // for GlodaUtils.deMime and parseMailAddresses
Cu.import("resource:///modules/gloda/indexer.js");
Cu.import("resource:///modules/gloda/mimemsg.js"); // for check attachment name, https://developer.mozilla.org/en/Extensions/Thunderbird/HowTos/Common_Thunderbird_Use_Cases/View_Message
Cu.import("resource://gre/modules/StringBundle.js");
let Application = null;
try {
  Application = Cc["@mozilla.org/steel/application;1"].getService(Ci.steelIApplication); // Thunderbird
} catch (e) {}

var ExpressionSearchVariable = {
  stopreq: Number.MAX_VALUE,
  startreq: Number.MAX_VALUE,
  stopping: false,
  starting: false,
  resuming: 0,
  stopped: false,
};

let strings = new StringBundle("chrome://expressionsearch/locale/ExpressionSearch.properties");

function _getRegEx(aSearchValue) {
  /*
   * If there are no flags added, you can add a regex expression without
   * / delimiters. If we detect a / though, we will look for flags and
   * add them to the regex search.
   */
  let searchValue = aSearchValue;
  let searchFlags = "";
  if (aSearchValue.charAt(0) == "/")
  {
    let lastSlashIndex = aSearchValue.lastIndexOf("/");
    searchValue = aSearchValue.substring(1, lastSlashIndex);
    searchFlags = aSearchValue.substring(lastSlashIndex + 1);
  }
  return [searchValue, searchFlags];
}

(function ExperssionSearchCustomerTerms() {
  
  function customerTermBase(nameId, Operators){
    let self = this; // In constructors, this is always your instance. Just for safe.
    self.id = "expressionsearch#" + nameId;
    self.name = strings.get(nameId);
    self.needsBody = false;
    self._isValid = function _isValid(aSearchScope) {
      if ( aSearchScope==nsMsgSearchScope.LDAP || aSearchScope==nsMsgSearchScope.LDAPAnd || aSearchScope==nsMsgSearchScope.LocalAB|| aSearchScope==nsMsgSearchScope.LocalABAnd ) return false;
      if ( ! self.needsBody ) return true;
      if ( aSearchScope==nsMsgSearchScope.offlineMail || aSearchScope==nsMsgSearchScope.offlineMailFilter
        || aSearchScope==nsMsgSearchScope.localNewsBody || aSearchScope==nsMsgSearchScope.localNewsJunkBody ) return true;
      return false;
      //onlineManual 
    };
    self.getEnabled = function _getEnabled(scope, op) {
      return self._isValid(scope);
    };
    // called by searchSpec.js to check if avaliable for offlineScope and serverScope
    // or in addressbook search
    self.getAvailable = function _getAvailable(scope, op) {
      return self._isValid(scope);
    };
    self.getAvailableOperators = function _getAvailableOperators(scope, length) {
      if (!self._isValid(scope)) {
        length.value = 0;
        return [];
      }
      length.value = Operators.length;
      return Operators;
    };
  }
  
  // search subject with regular expression, reference FiltaQuilla by Kent James
  // case sensitive
  let subjectRegex = new customerTermBase("subjectRegex", [nsMsgSearchOp.Matches, nsMsgSearchOp.DoesntMatch]);
  subjectRegex.match = function _match(aMsgHdr, aSearchValue, aSearchOp) {
    // aMsgHdr.subject is mime encoded, also aMsgHdr.subject may has line breaks in it
    // Upon putting subject into msg db, all Re:'s are stripped and MSG_FLAG_HAS_RE flag is set. 
    let subject = aMsgHdr.mime2DecodedSubject || '';
    if ( aMsgHdr.flags & Ci.nsMsgMessageFlags.HasRe ) subject = "Re: " + subject; // mailnews.localizedRe ?
    let searchValue;
    let searchFlags;
    [searchValue, searchFlags] = _getRegEx(aSearchValue);
    let regexp = new RegExp(searchValue, searchFlags);
    return regexp.test(subject) ^ (aSearchOp == nsMsgSearchOp.DoesntMatch);
  };
  
  // workaround for Bug 124641 - Thunderbird does not handle multi-line headers correctly when search term spans lines
  // case sensitive, not like normal subject search
  // Now the bug was fixed after TB5.0, but still usefull when subject contains special characters
  let subjectSimple = new customerTermBase("subjectSimple", [nsMsgSearchOp.Contains, nsMsgSearchOp.DoesntContain]);
  subjectSimple.match = function _match(aMsgHdr, aSearchValue, aSearchOp) {
    return (aMsgHdr.mime2DecodedSubject.indexOf(aSearchValue) != -1) ^ (aSearchOp == nsMsgSearchOp.DoesntContain);
    return !res;
  };
  
  let headerRegex = new customerTermBase("headerRegex", [nsMsgSearchOp.Matches, nsMsgSearchOp.DoesntMatch]);
  headerRegex.match = function _match(aMsgHdr, aSearchValue, aSearchOp) {
    // https://bugzilla.mozilla.org/show_bug.cgi?id=363238
    // https://developer.mozilla.org/en-US/docs/Extensions/Thunderbird/customDBHeaders_Preference
    // https://github.com/protz/thunderbird-stdlib/blob/master/msgHdrUtils.js msgHdrGetHeaders
    // the header and its regex are separated by a '~' or '=' in aSearchValue
    // 'List-Id=/all-test/i' will match all messages that have List-ID header, and it's content match /all-test/i
    // 'List-ID' will match all messages that have this header.
    // flags, label, statusOfset, sender, recipients, ccList, subject, message-id, references, date, dateReceived
    // priority, msgCharSet, size, numLines, offlineMsgSize, threadParent, msgThreadId, ProtoThreadFlags, gloda-id, sender_name, gloda-dirty, recipient_names

    // let e = aMsgHdr.propertyEnumerator; let str = "property:\n";
    // while ( e.hasMore() ) { let k = e.getNext(); str += k + ":" + aMsgHdr.getStringProperty(k) + "\n"; }
    // ExpressionSearchLog.log(str);
    // flags:1 label:0 statusOfset:21 sender:<cc@some.com> recipients:swe-web@some.com subject:[swe-web] Error: Web Applications Down message-id:201202030701.q1371Noo014742@peopf999.some.com date:4f2b8643 dateReceived:4f2b864b priority:1 list-id:<swe-web.some.com> x-mime-autoconverted:from quoted-printable to 8bit by sympa.some.com id q1371O8j002081 msgCharSet:iso-8859-1 msgOffset:1f6e size:4728 numLines:180 storeToken:8046 threadParent:ffffffff msgThreadId:1f6e ProtoThreadFlags:0 sender_name:2453|swe-web@some.COM
    // Can't add content-type/receieved etc to customDBHeaders which thunderbird already parsed and removed from header
    
    let headerName = aSearchValue.toLowerCase();
    let splitIndex = aSearchValue.indexOf('~');
    if (splitIndex == -1) splitIndex = aSearchValue.indexOf('=');
    if (splitIndex == -1) {
      let headerValue = aMsgHdr.getStringProperty(headerName);
      return ( ( headerValue != '' ) ^ ( aSearchOp == nsMsgSearchOp.DoesntMatch ) );
    }
    headerName = aSearchValue.slice(0, splitIndex);
    let regex = aSearchValue.slice(splitIndex + 1); 
    let searchValue;
    let searchFlags;
    [searchValue, searchFlags] = _getRegEx(regex);
    let regexp = new RegExp(searchValue, searchFlags);
    let headerValue = aMsgHdr.getStringProperty(headerName);
    return regexp.test(headerValue) ^ ( aSearchOp == nsMsgSearchOp.DoesntMatch );
  };

  let dayTime = new customerTermBase("dayTime", [nsMsgSearchOp.IsBefore, nsMsgSearchOp.IsAfter]);
  dayTime.match = function _match(aMsgHdr, aSearchValue, aSearchOp) {
    let msgDate = new Date(aMsgHdr.date/1000); // = dateInSeconds*1M
    let msgTime = msgDate.toLocaleFormat("%H:%M:%S"); // toLocaleTimeString depend on user settings
    return (msgTime > aSearchValue) ^ (aSearchOp == nsMsgSearchOp.IsBefore);
  };

  let dateMatch = new customerTermBase("dateMatch", [nsMsgSearchOp.Contains, nsMsgSearchOp.DoesntContain]);
  dateMatch.match = function _match(aMsgHdr, aSearchValue, aSearchOp) {
    let msgDate = new Date(aMsgHdr.date/1000);
    let msgTimeUser = msgDate.toLocaleString();
    let msgTimeStandard = msgDate.toLocaleFormat("%Y/%m/%d %H:%M:%S");
    return ( msgTimeUser.indexOf(aSearchValue) != -1 || msgTimeStandard.indexOf(aSearchValue) != -1 ) ^ (aSearchOp == nsMsgSearchOp.DoesntContain);
  };

  let bccSearch = new customerTermBase("Bcc", [nsMsgSearchOp.Contains, nsMsgSearchOp.DoesntContain]);
  bccSearch.match = function _match(aMsgHdr, aSearchValue, aSearchOp) {
    return (GlodaUtils.deMime(aMsgHdr.bccList).toLowerCase().indexOf(aSearchValue.toLowerCase()) != -1) ^ (aSearchOp == nsMsgSearchOp.DoesntContain);
  };

  let toSomebodyOnly = new customerTermBase("toSomebodyOnly", [nsMsgSearchOp.Contains, nsMsgSearchOp.DoesntContain]);
  toSomebodyOnly.match = function _match(aMsgHdr, aSearchValue, aSearchOp) {
    let mailRecipients = GlodaUtils.parseMailAddresses(aMsgHdr.mime2DecodedRecipients.toLowerCase());
    let searchRecipients = GlodaUtils.parseMailAddresses(aSearchValue.toLowerCase()); 
    let match = ( mailRecipients.count == searchRecipients.count );
    match = match && searchRecipients.addresses.every( function(searchOne, index, array) {
      // can't use aMsgHdr.mime2DecodedRecipients.toLowerCase().indexOf() because the recipient may in our addressbook and TB show it's Name instead of address
      return mailRecipients.fullAddresses.some( function(recipientOne, index, array) {
        if ( recipientOne.indexOf(searchOne) != -1 ) return true; // found one in mailRecipients
      } );
    } );
    return ( match ^ (aSearchOp == nsMsgSearchOp.DoesntContain) );
  };
  
  function asyncTermBase(nameId, Operators) {
    let self = this;
    self.retryStop = function() {
      if ( ExpressionSearchVariable.resuming || ExpressionSearchVariable.starting || ExpressionSearchVariable.stopreq > ExpressionSearchVariable.startreq ) {
        self.topWin.setTimeout(self.retryStop,10);
      } else {
        ExpressionSearchVariable.stopping = true;
        self.topWin.onSearchStopSavedByES.apply(self.topWin, arguments);
        ExpressionSearchVariable.stopped = true;
        ExpressionSearchVariable.stopping = false;
        ExpressionSearchVariable.stopreq = Number.MAX_VALUE;
      }
    };
    
    self.tryResume = function() {
      if ( ExpressionSearchVariable.stopped || ExpressionSearchVariable.stopreq != Number.MAX_VALUE || ExpressionSearchVariable.stopping ) return;
      ExpressionSearchVariable.resuming++;
      try {
        if ( typeof(self.searchSession.resumeSearch) == 'function' ) {
          self.searchSession.resumeSearch();
        }
      } catch ( err ) {
      }
      ExpressionSearchVariable.resuming--;
    };

    customerTermBase.call(self, nameId, Operators );
    self.needsBody = true;
    self.timer = null;
    self.match = function _match(aMsgHdr, aSearchValue, aSearchOp) {
      try {
        /* OK, this is tricky and experimental, to get the attachment list, I need to call MsgHdrToMimeMessage, which is async.
           So, I need to call thread.processNextEvent to wait for it. However, this may lead to reenter issue and crash Thunderbird.
           Normally crash @ http://mxr.mozilla.org/comm-central/source/mailnews/base/search/src/nsMsgLocalSearch.cpp#752
           dbErr = m_listContext->GetNext(getter_AddRefs(currentItem)); // @nsresult nsMsgSearchOfflineMail::Search (PRBool *aDone)
           I guess reenter will happen after CleanUpScope().
      
           Thus before https://bugzilla.mozilla.org/show_bug.cgi?id=224392 is implemented, My solution is:
           1. find the searchSession, which is tricky
           2. pauseSearch
           3. setup a timer to resumeSearch after current timeSlice finished
           4. hook onSearchStop to prevent interruptSearch when resumeSearch called
           5. hook associateView & dissociateView also
        */
        let topWins = Services.wm.getEnumerator(null);
        while (topWins.hasMoreElements()) {
          self.topWin = topWins.getNext();
          self.topWin.QueryInterface(Ci.nsIDOMWindowInternal); // should use nsIDOMWindow for TB8+
          if ( self.topWin.gFolderDisplay && self.topWin.gFolderDisplay.view && self.topWin.gFolderDisplay.view.search && self.topWin.gFolderDisplay.view.search.session ) {
            let curSession = self.topWin.gFolderDisplay.view.search.session;
            self.searchSession = curSession; // default set to one session
            for ( let i=0; i<curSession.numSearchTerms; i++ ) {
              let term = curSession.searchTerms.GetElementAt(i);
              if ( term && term.customId == self.id ) { // only works for quick filter, not for advanced search
                self.searchSession = curSession;
                break;
              }
            }
          }
        }
        
        ExpressionSearchVariable.stopped = false;
        // searchDialog.onSearchStop call interruptsearch directly, need to handle it
        if ( typeof(self.topWin.onSearchStopSavedByES)=='undefined' && self.topWin.onSearchStop ) {
          self.topWin.onSearchStopSavedByES = self.topWin.onSearchStop;
          self.topWin.onSearchStop = function () {
            ExpressionSearchVariable.stopreq = new Date().getTime();
            self.retryStop();
          }
        }
      
        if ( typeof(self.timer) != 'undefined' ) self.topWin.clearTimeout(self.timer);
        try {
          self.searchSession.pauseSearch(); // may call many times
        } catch (err) {
          ExpressionSearchLog.logException(err, false);
        }
        if ( ExpressionSearchVariable.stopped || ExpressionSearchVariable.stopreq != Number.MAX_VALUE || ExpressionSearchVariable.stopping ) return;
        return self.matchFunc.call(self, aMsgHdr, aSearchValue, aSearchOp);
      } catch ( err ) {
        ExpressionSearchLog.logException(err);
        return false;
      }
    };
  }
  
  // case insensitive
  let attachmentNameOrType = new asyncTermBase("attachmentNameOrType", [nsMsgSearchOp.Contains, nsMsgSearchOp.DoesntContain]);
  attachmentNameOrType.matchFunc = function _match(aMsgHdr, aSearchValue, aSearchOp) {
    let self = this;
    self.timer = self.topWin.setTimeout(self.tryResume, 20); // wait 20ms for messages without attachment
    // no matter Contains or DoesntContain, return false if no attachement
    if ( ! ( aMsgHdr.flags & nsMsgMessageFlags.Attachment ) ) return false;
    self.topWin.clearTimeout(self.timer); // reset timer when need to check attachment
    let newSearchValue = aSearchValue.toLowerCase();
    let found = false;
    let haveAttachment = false;
    let complete = false;
    
    MsgHdrToMimeMessage(aMsgHdr, null, function(aMsgHdr, aMimeMsg) { // async call back function
      for each (let [, attachment] in Iterator(aMimeMsg.allAttachments)) {
        if ( attachment.isRealAttachment ) { // .contentType/.size/.isExternal
          haveAttachment = true;
          if ( attachment.name.toLowerCase().indexOf(newSearchValue) != -1 || attachment.contentType.toLowerCase().indexOf(newSearchValue) != -1 ) {
            found = true;
            break;
          }
        }
      }
      complete = true;
    }, false/*allow download*/, {saneBodySize: true});
    
    // https://developer.mozilla.org/en/Code_snippets/Threads#Waiting_for_a_background_task_to_complete
    let thread = Services.tm.currentThread;
    while (!complete && !ExpressionSearchVariable.stopped && ExpressionSearchVariable.stopreq == Number.MAX_VALUE && !ExpressionSearchVariable.stopping ) {
        thread.processNextEvent(true); // may wait, and validator will report warnings of dead lock on this line
    }
    
    if ( ExpressionSearchVariable.stopped || ExpressionSearchVariable.stopreq != Number.MAX_VALUE || ExpressionSearchVariable.stopping ) return;
    self.timer = self.topWin.setTimeout(self.tryResume, 20); // 200ms for one timeSlice
    
    if (!haveAttachment) return false;
    return found ^ (aSearchOp == nsMsgSearchOp.DoesntContain) ;
  };
  
  let bodyRegex = new asyncTermBase("bodyRegex", [nsMsgSearchOp.Matches, nsMsgSearchOp.DoesntMatch]);
  bodyRegex.matchFunc = function _match(aMsgHdr, aSearchValue, aSearchOp) {
    let self = this;
    let messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
    let listener = Cc["@mozilla.org/network/sync-stream-listener;1"].createInstance(Ci.nsISyncStreamListener);
    let folder = aMsgHdr.folder;
    let uri = folder.getUriForMsg(aMsgHdr);
    messenger.messageServiceFromURI(uri).streamMessage(uri, listener, self.topWin.msgWindow, null, false, "");
    let data = folder.getMsgTextFromStream(listener.inputStream, aMsgHdr.Charset, aMsgHdr.messageSize /*read*/, aMsgHdr.messageSize /*max output*/, false/*compressQuotes*/, true/*strip HTML*/, { }/*contentType*/); // return AUTF8String
    let searchValue;
    let searchFlags;
    [searchValue, searchFlags] = _getRegEx(aSearchValue);
    let regexp = new RegExp(searchValue, searchFlags);
    let result = regexp.test(data) ^ (aSearchOp == nsMsgSearchOp.DoesntMatch);
    
    if ( ExpressionSearchVariable.stopped || ExpressionSearchVariable.stopreq != Number.MAX_VALUE || ExpressionSearchVariable.stopping ) return;
    self.timer = self.topWin.setTimeout(self.tryResume, 20); // 200ms for one timeSlice
    return result;
  };

  let filterService = MailServices.filters;
  filterService.addCustomTerm(bccSearch);
  filterService.addCustomTerm(toSomebodyOnly);
  filterService.addCustomTerm(subjectRegex);
  filterService.addCustomTerm(subjectSimple);
  filterService.addCustomTerm(headerRegex);
  filterService.addCustomTerm(dayTime);
  filterService.addCustomTerm(dateMatch);
  filterService.addCustomTerm(attachmentNameOrType);
  filterService.addCustomTerm(bodyRegex);
})();

let ExperssionSearchFilter = {
  name: "expression",
  domId: "expression-search-textbox",
  
  // request to create virtual folder, set to the ExpressionSearchChrome when need to create
  latchQSFolderReq: 0,

  appendTerms: function(aTermCreator, aTerms, aFilterValue) {
    try {
      // we're in javascript modules, no window object, so first find the top window
      let topWin = {};
      if ( aTermCreator && aTermCreator.window && aTermCreator.window.domWindow &&  aTermCreator.window.domWindow.ExpressionSearchChrome )
        topWin = aTermCreator.window.domWindow;
      else
        topWin = Services.wm.getMostRecentWindow("mail:3pane");

      if (aFilterValue.text) {
        if ( aFilterValue.text.toLowerCase().indexOf('g:') == 0 ) { // may get called when init with saved values in searchInput.
          return;
        }
      
        // check if in normal filter mode
        if ( topWin.ExpressionSearchChrome.options.act_as_normal_filter ) {
          let checkColon = new RegExp('(?:^|\\b)(?:' + ExpressionSearchTokens.allTokens + '):', 'g');
          if ( !checkColon.test(aFilterValue.text) ) { // can't find any my token
            let QuickFilterBarMuxer = topWin.QuickFilterBarMuxer;
            // Use normalFilter's appendTerms to create search term
            let normalFilterState = QuickFilterBarMuxer.activeFilterer.filterValues['text'];
            let originalText = normalFilterState.text;
            normalFilterState.text = aFilterValue.text;
            let normalFilter = QuickFilterManager.filterDefsByName['text'];
            normalFilter.appendTerms.apply(normalFilter, [aTermCreator, aTerms, normalFilterState]);
            topWin.ExpressionSearchChrome.showHideHelp(true, undefined, undefined, undefined, this.getSearchTermString(aTerms));
            normalFilterState.text = originalText;
            topWin.document.getElementById("quick-filter-bar-filter-text-bar").collapsed = false;
            return;
          } else {
            let normalFilterBox = topWin.document.getElementById("qfb-qs-textbox");
            if ( normalFilterBox && normalFilterBox.value == "" )
              topWin.document.getElementById("quick-filter-bar-filter-text-bar").collapsed = true;
          }
        }
        
        // first remove trailing specifications if it's empty
        // then remove trailing ' and' but no remove of "f: and"
        let regExpReplace = new RegExp( '(?:^|\\s+)(?:' + ExpressionSearchTokens.allTokens + '):(?:\\(|)\\s*$', "i");
        let regExpSearch = new RegExp( '\\b(?:' + ExpressionSearchTokens.allTokens + '):\\s+and\\s*$', "i");
        var aSearchString = aFilterValue.text.replace(regExpReplace,'');
        if ( !regExpSearch.test(aSearchString) ) {
          aSearchString = aSearchString.replace(/\s+\and\s*$/i,'');
        }
        aSearchString.replace(/\s+$/,'');
        if ( aSearchString == '' ) {
          return;
        }
        var e = ExpressionSearchComputeExpression(aSearchString);
        if ( ExperssionSearchFilter.latchQSFolderReq ) {
          let terms = aTerms.slice();
          ExperssionSearchFilter.createSearchTermsFromExpression(e,aTermCreator,terms);
          ExperssionSearchFilter.latchQSFolderReq.createQuickFolder.apply(ExperssionSearchFilter.latchQSFolderReq, [terms]);
          ExperssionSearchFilter.latchQSFolderReq = 0;
        } else {
          ExpressionSearchLog.info("Experssion Search Statements: " + ExpressionSearchExprToStringInfix(e));
          ExperssionSearchFilter.createSearchTermsFromExpression(e,aTermCreator,aTerms);
          if ( topWin.ExpressionSearchChrome ) topWin.ExpressionSearchChrome.showHideHelp(true, undefined, undefined, undefined, this.getSearchTermString(aTerms));
        }
        return;
      } else {
        //showHideHelp(topWin.document, false, '');
      }
    } catch (err) {
        ExpressionSearchLog.logException(err);
    }
  },

  domBindExtra: function(aDocument, aMuxer, aNode) {
    // -- platform-dependent emptytext setup
    let filterNode = aDocument.getElementById('qfb-qs-textbox');
    let quickKey = '';
    let attributeName = "placeholder";
    if ( filterNode && typeof(Application)!='undefined' ) {
      quickKey = filterNode.getAttribute(Application.platformIsMac ? "keyLabelMac" : "keyLabelNonMac");
      // now Ctrl+F will focus to our input, so remove the message in builtin one
      filterNode.setAttribute( attributeName, filterNode.getAttribute("emptytextbase").replace("#1", '') );
      // force to update the message
      filterNode.value = '';
    }
    aNode.setAttribute( attributeName, aNode.getAttribute("emptytextbase").replace("#1", quickKey) );
    // force an update of the emptytext now that we've updated it.
    aNode.value = "";
  },

  getDefaults: function() { // this function get called pretty early
    return {
      text: null,
    };
  },

  propagateState: function(aOld, aSticky) {
    return {
      // must clear state when create quick search folder, or recursive call happenes when aSticky.
      text: ( aSticky && !ExperssionSearchFilter.latchQSFolderReq && typeof(aOld) != 'undefined' )? aOld.text : null,
      //states: {},
    };
  },

  onCommand: function(aState, aNode, aEvent, aDocument) { // may get skipped when init, but appendTerms get called
    let ExpressionSearchChrome = {};
    if ( aDocument && aDocument.defaultView && aDocument.defaultView.window && aDocument.defaultView.window.ExpressionSearchChrome )
      ExpressionSearchChrome = aDocument.defaultView.window.ExpressionSearchChrome;
    
    let text = aNode.value.length ? aNode.value : null;
    aState = aState || {}; // or will be no search.
    let needSearch = false;
    if ( ExpressionSearchChrome.isEnter ) {
      // press Enter to select searchInput
      aNode.select();
      // if text not null and create qs folder return true
      if ( text && ExperssionSearchFilter.latchQSFolderReq ) {
        needSearch = true;
      }
    }
    if ( text != aState.text ) {
      aState.text = text;
      needSearch = true;
    }
    if ( !needSearch && ExpressionSearchChrome.isEnter && ExpressionSearchChrome.options && ExpressionSearchChrome.options.select_msg_on_enter ) // else the first message will be selected in reflectInDom
        ExpressionSearchChrome.selectFirstMessage(true);
    return [aState, needSearch];
  },

  // change DOM status, eg disabled, checked, etc.
  // by AMuxer.onActiveAllMessagesLoaded or reflectFiltererState
  reflectInDOM: function(aNode, aFilterValue, // aFilterValue is the 1st value PFT returns
                        aDocument, aMuxer,
                        aFromPFP) { //PFP: PostFilterProcess, the second value PFP returns
    // Update the text if it has changed (linux does weird things with empty
    //  text if we're transitioning emptytext to emptytext)
    let desiredValue = "";
    if ( aFilterValue && aFilterValue.text )
      desiredValue = aFilterValue.text;
    if ( aNode.value != desiredValue && !aFromPFP )
      aNode.value = desiredValue;

    let ExpressionSearchChrome = {};
    if ( aDocument && aDocument.defaultView && aDocument.defaultView.window && aDocument.defaultView.window.ExpressionSearchChrome )
      ExpressionSearchChrome = aDocument.defaultView.window.ExpressionSearchChrome;
    if ( ExpressionSearchChrome ) ExpressionSearchChrome.showHideHelp(false);
    
    let panel = aDocument.getElementById("qfb-text-search-upsell");
    if (aFromPFP == "upsell") {
      let searchString = ExperssionSearchFilter.expression2gloda(aFilterValue.text);
      let line1 = aDocument.getElementById("qfb-upsell-line-one");
      let line2 = aDocument.getElementById("qfb-upsell-line-two");
      line1.value = line1.getAttribute("fmt").replace("#1", searchString);
      line2.value = line2.getAttribute("fmt").replace("#1", searchString);
      if (panel.state == "closed" && aDocument.commandDispatcher.focusedElement == aNode.inputField)
        panel.openPopup(aNode, "after_start", -7, 7, false, true);
      return;
    }

    if (panel.state != "closed")
      panel.hidePopup();

    ExpressionSearchChrome.selectFirstMessage(ExpressionSearchChrome.isEnter && ExpressionSearchChrome.options.select_msg_on_enter);
  },

  postFilterProcess: function(aState, aViewWrapper, aFiltering) {
    // If we're not filtering, not filtering on text, there are results, or
    //  gloda is not enabled so upselling makes no sense, then bail.
    // (Currently we always return "nosale" to make sure our panel is closed;
    //  this might be overkill but unless it becomes a performance problem, it
    //  keeps us safe from weird stuff.)
    // ExpressionSearchLog.log( 'aViewWrapper.dbView:'+aViewWrapper.dbView.viewType+":"+aViewWrapper.dbView.numMsgsInView + ":" + aViewWrapper.dbView.rowCount + ":" + aViewWrapper.dbView.viewFlags );
    if (!aFiltering || !aState || !aState.text || !aViewWrapper || aViewWrapper.dbView.numMsgsInView || aViewWrapper.dbView.rowCount /* Bug 574799 */ || !GlodaIndexer.enabled)
      return [aState, "nosale", false];
      
    if ( ExpressionSearchVariable.startreq != Number.MAX_VALUE ) return [aState, "nosale", false]; // remove me later

    // since we're filtering, filtering on text, and there are no results, tell the upsell code to get bizzay
    return [aState, "upsell", false];
  },
  
  addSearchTerm: function(aTermCreator, searchTerms, str, attr, op, is_or, grouping) {
    let aCustomId;
    if ( typeof(attr) == 'object' && attr.type == nsMsgSearchAttrib.Custom ) {
      aCustomId = attr.customId;
      attr = nsMsgSearchAttrib.Custom;
    }
    var term,value;
    term = aTermCreator.createTerm();
    term.attrib = attr;
    value = term.value;
    // This is tricky - value.attrib must be set before actual values, from searchTestUtils.js 
    value.attrib = attr;

    if (attr == nsMsgSearchAttrib.JunkPercent)
      value.junkPercent = str;
    else if (attr == nsMsgSearchAttrib.Priority)
      value.priority = str;
    else if (attr == nsMsgSearchAttrib.Date)
      value.date = str;
    else if (attr == nsMsgSearchAttrib.MsgStatus || attr == nsMsgSearchAttrib.FolderFlag || attr == nsMsgSearchAttrib.Uint32HdrProperty)
      value.status = str;
    else if (attr == nsMsgSearchAttrib.MessageKey)
      value.msgKey = str;
    else if (attr == nsMsgSearchAttrib.Size)
      value.size = str;
    else if (attr == nsMsgSearchAttrib.AgeInDays)
      value.age = str;
    else if (attr == nsMsgSearchAttrib.Label)
      value.label = str;
    else if (attr == nsMsgSearchAttrib.JunkStatus)
      value.junkStatus = str;
    else if (attr == nsMsgSearchAttrib.HasAttachmentStatus)
      value.status = nsMsgMessageFlags.Attachment;
    else
      value.str = str;

    term.value = value;
    term.op = op;
    term.booleanAnd = !is_or;
    
    if (attr == nsMsgSearchAttrib.Custom)
      term.customId = aCustomId;
    else if (attr == nsMsgSearchAttrib.OtherHeader)
      term.arbitraryHeader = aArbitraryHeader;
    else if (attr == nsMsgSearchAttrib.HdrProperty || attr == nsMsgSearchAttrib.Uint32HdrProperty)
      term.hdrProperty = aHdrProperty;

    searchTerms.push(term);
  },

  get_key_from_tag: function(myTag) {
    if ( myTag == 'na' ) return myTag;
    var tagArray = MailServices.tags.getAllTags({});
    // consider two tags, one is "ABC", the other is "ABCD", when searching for "AB", perfect is return both.
    // however, that need change the token tree.
    // so here I just return the best fit "ABC".
    let uniqueKey = '';
    let myTagLen = myTag.length;
    let lenDiff = 10000000; // big enough?
    for (var i = 0; i < tagArray.length; ++i) {
      let tag = tagArray[i].tag.toLowerCase();
      if (tag.indexOf(myTag) >= 0 && ( tag.length-myTagLen < lenDiff ) ) {
        uniqueKey = tagArray[i].key;
        lenDiff = tag.length-myTagLen;
        if ( lenDiff == 0 ) break;
      }
    }
    if (uniqueKey != '') return uniqueKey;
    return "..unknown..";
  },
  
  expression2gloda: function(searchValue) {
    searchValue = searchValue.replace(/^g:\s*/i,'');
    let regExp = new RegExp( "(?:^|\\b)(?:" + ExpressionSearchTokens.allTokens + "):", "g");
    searchValue = searchValue.replace(regExp,'');
    searchValue = searchValue.replace(/(?:\b|^)(?:and|or)(?:\b|$)/g,'').replace(/[()]/g,'');
    return searchValue;
  },
  
  getSearchTermString: function(searchTerms) {
    let condition = "";
    searchTerms.forEach( function(searchTerm, index, array) {
      if (index > 0) condition += " ";
      if (searchTerm.matchAll)
        condition += "ALL";
      else {
        condition += searchTerm.booleanAnd ? "AND" : "OR";
        condition += searchTerm.beginsGrouping && !searchTerm.endsGrouping ? " {" : "";
      }
      let converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"] .createInstance(Ci.nsIScriptableUnicodeConverter);
      converter.charset = 'UTF-8';
      let termString = converter.ConvertToUnicode(searchTerm.termAsString); // termAsString is ACString
      condition += " (" + termString + ")"; 
      // "}" may not balanced with "{", but who cares
      condition += searchTerm.endsGrouping && !searchTerm.beginsGrouping ? " }" : "";
    } );
    return condition;
  },
  
  convertExpression: function(e,aTermCreator,searchTerms,was_or) {
    var is_not = false;
    if (e.kind == 'op' && e.tok == '-') {
      if (e.left.kind != 'spec') {
        ExpressionSearchLog.log('Exression Search: unexpected expression tree',1);
        return;
      }
      e = e.left;
      is_not = true;
    }
    if (e.kind == 'spec') {
      let attr;
      let op = is_not ? nsMsgSearchOp.DoesntContain:nsMsgSearchOp.Contains;
      if (e.tok == 'from') attr = nsMsgSearchAttrib.Sender;
      else if (e.tok == 'to') attr = nsMsgSearchAttrib.ToOrCC;
      else if (e.tok == 'tonocc') attr = nsMsgSearchAttrib.To;
      else if (e.tok == 'cc') attr = nsMsgSearchAttrib.CC;
      else if (e.tok == 'days' || e.tok == 'older_than' || e.tok == 'newer_than') attr = nsMsgSearchAttrib.AgeInDays;
      // AllAddresses,AnyText,Size,Name,DisplayName,Nickname,ScreenName,Email,AdditionalEmail
      else if (e.tok == 'subject') attr = nsMsgSearchAttrib.Subject;
      else if (e.tok == 'bcc') attr = { type:nsMsgSearchAttrib.Custom, customId: 'expressionsearch#Bcc' };
      else if (e.tok == 'only') attr = { type:nsMsgSearchAttrib.Custom, customId: 'expressionsearch#toSomebodyOnly' };
      else if (e.tok == 'simple') attr = { type:nsMsgSearchAttrib.Custom, customId: 'expressionsearch#subjectSimple' };
      else if (e.tok == 'regex') attr = { type:nsMsgSearchAttrib.Custom, customId: 'expressionsearch#subjectRegex' };
      else if (e.tok == 'headerre') attr = { type:nsMsgSearchAttrib.Custom, customId: 'expressionsearch#headerRegex' };
      else if (e.tok == 'date') attr = { type:nsMsgSearchAttrib.Custom, customId: 'expressionsearch#dateMatch' };
      else if (e.tok == 'filename') attr = { type:nsMsgSearchAttrib.Custom, customId: 'expressionsearch#attachmentNameOrType' };
      else if (e.tok == 'bodyre') attr = { type:nsMsgSearchAttrib.Custom, customId: 'expressionsearch#bodyRegex' };
      else if (e.tok == 'body') attr = nsMsgSearchAttrib.Body;
      else if (e.tok == 'attachment') attr = nsMsgSearchAttrib.HasAttachmentStatus;
      else if (e.tok == 'status') attr = nsMsgSearchAttrib.MsgStatus;
      else if (e.tok == 'size' || e.tok == 'smaller') attr = nsMsgSearchAttrib.Size;
      else if (e.tok == 'before' || e.tok == 'after') attr = nsMsgSearchAttrib.Date;
      else if (e.tok == 'tag') {
        e.left.tok = this.get_key_from_tag(e.left.tok.toLowerCase());
        attr = nsMsgSearchAttrib.Keywords;
        if ( e.left.tok.toLowerCase() == 'na' ) op = is_not ? nsMsgSearchOp.IsntEmpty:nsMsgSearchOp.IsEmpty;
      } else if (e.tok == 'calc' ) {
        return;
      } else {ExpressionSearchLog.log('Exression Search: unexpected specifier',1); return; }
      if (e.left.kind != 'str') {
        ExpressionSearchLog.log('Exression Search: unexpected expression tree',1);
        return;
      }
      if (e.tok == 'attachment') {
        if ( !/^(?:y|1|n|0|yes|no)$/i.test(e.left.tok)) { // treat as filename
          e.tok = 'filename';
          attr = { type:nsMsgSearchAttrib.Custom, customId: 'expressionsearch#attachmentNameOrType' };
        } else if (!/^[Yy1]/.test(e.left.tok)) {
          // looking for no attachment; reverse is_not.
          is_not = !is_not;
        }
      }
      if ( attr == nsMsgSearchAttrib.Date) {
        // is before: before => false, true: true
        // is after: after   => false, false: false
        // isnot before: after => true, ture: false
        // isnot after: before => true, false: true
        op = (is_not^(e.tok=='before')) ? nsMsgSearchOp.IsBefore : nsMsgSearchOp.IsAfter;
        let inValue = e.left.tok;
        let dayTimeRe = /^\s*((\d{1,2}):(\d{1,2})(:(\d{1,2})){0,1})\s*$/;
        if ( dayTimeRe.test(inValue) ) { // dayTime
          let newTime = inValue.replace(dayTimeRe, '$2:$3:$5');
          if ( /:$/.test(newTime) ) newTime += '0';
          let timeArray = newTime.split(':');
          let invalidTime = false;
          timeArray.forEach( function(item, index, array) {
            // change to 00:00:00 format
            if ( item.length == 1 ) {
              item = "0" + item;
              array[index] = item;
            }
            if ( ( index == 0 && item > '23' ) || ( index > 0 && item > '61' ) ) { // 61 is for leap seconds ;-)
              if ( !invalidTime )
                ExpressionSearchLog.log('Expression Search: dayTime '+ inValue + " is not valid",1);
              invalidTime = true;
            }
          } );
          if ( invalidTime ) return;
          e.left.tok = timeArray.join(":");
          attr = { type:nsMsgSearchAttrib.Custom, customId: 'expressionsearch#dayTime' };
        } else try { // normal date
          let date = new Date(inValue);
          e.left.tok = date.getTime()*1000; // why need *1000, I don't know ;-)
          if ( isNaN(e.left.tok) ) {
            ExpressionSearchLog.log('Expression Search: date '+ inValue + " is not valid",1);
            return;
          }
        } catch (err) {
          ExpressionSearchLog.logException(err);
          return;
        }
      }
      if (e.tok == 'status') {
        if (/^Rep/i.test(e.left.tok))
          e.left.tok = nsMsgMessageFlags.Replied;
        else if (/^Rea/i.test(e.left.tok))
          e.left.tok = nsMsgMessageFlags.Read;
        else if (/^M/i.test(e.left.tok))
          e.left.tok = nsMsgMessageFlags.Marked;
        else if (/^Star/i.test(e.left.tok))
          e.left.tok = nsMsgMessageFlags.Marked;
        else if (/^F/i.test(e.left.tok))
          e.left.tok = nsMsgMessageFlags.Forwarded;
        else if (/^N/i.test(e.left.tok))
          e.left.tok = nsMsgMessageFlags.New;
        else if (/^(?:I|D)/i.test(e.left.tok))
          e.left.tok = nsMsgMessageFlags.ImapDeleted;          
        else if (/^A/i.test(e.left.tok))
          e.left.tok = nsMsgMessageFlags.Attachment;
        else if (/^UnR/i.test(e.left.tok)) {
          e.left.tok = nsMsgMessageFlags.Read;
          is_not = !is_not;
        } else {
          ExpressionSearchLog.log('Expression Search: unknown status '+e.left.tok,1);
          return;
        }
      }
      if ( attr == nsMsgSearchAttrib.AgeInDays ) { // age==days==older_than/newer_than 2y,3m,5d,6,-8
        if ( e.tok == 'newer_than' ) is_not = !is_not;
        // today == -1, yesterday == -2, day == '', week *=7, month *= 30?, year *= 365
        let match = e.left.tok.match(/^([-.\d]*)(\w*)/);
        if ( match.length == 3 ) {
          let [, days, period] = match;
          if ( days == '' ) days = 1;
          if ( period == '' ) period = 1;
          if (/^t/i.test(period)) { // today
            period = 1;
            is_not = !is_not;
          } else if (/^yes/i.test(period)) {
            period = 2;
            is_not = !is_not;
          } else if (/^d/i.test(period)) {
            period = 1;
          } else if (/^w/i.test(period)) {
            period = 7;
          } else if (/^m/i.test(period)) {
            period = 30.4369;
          } else if (/^yea/i.test(period)) {
            period = 365.2425;
          }
          e.left.tok = days * period;
        }
      }
      if ( attr == nsMsgSearchAttrib.Size ) {
        if ( e.tok == 'smaller' ) is_not = !is_not;
        op = is_not ? nsMsgSearchOp.IsLessThan : nsMsgSearchOp.IsGreaterThan;
        let match = e.left.tok.match(/^([-.\d]*)(\w*)/i); // default KB, can be M,G
        if ( match.length == 3 ) {
          let [, size, scale] = match;
          if ( scale == '' ) scale = 1;
          if ( /^m/i.test(scale) ) {
            scale = 1024;
          } else if ( /^G/i.test(scale) ) {
            scale = 1024 * 1024;
          } else if ( /^K/i.test(scale) ) {
            scale = 1;
          } else if ( scale != 1 ) {
            ExpressionSearchLog.log("unknow size scale:'"+scale+"', can be K,M,G", 1);
            return;
          }
          e.left.tok = size * scale;
        }
      }
      else if (e.tok == 'size' || e.tok == 'smaller') ;
      if (e.tok == 'attachment' || e.tok == 'status')
        op = is_not ? nsMsgSearchOp.Isnt : nsMsgSearchOp.Is;
      else if ( e.tok == 'date' || e.tok == 'headerre' )
        op = is_not ? nsMsgSearchOp.DoesntMatch : nsMsgSearchOp.Matches;
      else if (attr == nsMsgSearchAttrib.AgeInDays)
        op = is_not ? nsMsgSearchOp.IsLessThan : nsMsgSearchOp.IsGreaterThan;
      else if ( e.tok == 'regex' || e.tok == 'bodyre' ) {
        op = is_not ? nsMsgSearchOp.DoesntMatch : nsMsgSearchOp.Matches;
        // check regex
        let searchValue, searchFlags;
        [searchValue, searchFlags] = _getRegEx(e.left.tok);
        try {
          let regexp = new RegExp(searchValue, searchFlags);
        } catch (err) {
          ExpressionSearchLog.log("Expression Search Caught Exception " + err.name + ":" + err.message + " with regex '" + e.left.tok + "'", 1);
          return;
        }
      }
      
      this.addSearchTerm(aTermCreator, searchTerms, e.left.tok, attr, op, was_or);
      return;
    }
    if (e.left != undefined)
      this.convertExpression(e.left, aTermCreator, searchTerms, was_or);
    if (e.right != undefined)
      this.convertExpression(e.right, aTermCreator, searchTerms, e.kind == 'op' && e.tok == 'or');
  },
  createSearchTermsFromExpression: function(e,aTermCreator,searchTerms) {
    // start converting the search expression.  Every search term
    // has an and or or field in it.  My current understanding is
    // that it's what this term should be preceded by.  Of course it
    // doesn't apply to the first term, but it appears the search
    // dialog uses it to set the radio button.  The dialog cannot
    // possibly deal with anything but expressions that are all one
    // or the other logical operator, but at least if the user gives
    // us an expression that is only or's, let's use the or value
    // for the type of the first term (second param to
    // convertExpression).  You can prove that the top expression
    // node will only be an 'or' if all operators are ors.
    this.convertExpression(e,aTermCreator,searchTerms, e.kind=='op' && e.tok=='or');

    // Add grouping attributes.  Look for the beginning and end of
    // each disjunct and mark it with grouping
    var firstDJTerm = -1;
    var priorTerm = null;

    for (var i = 0; i < searchTerms.length; i++) {
      if (!searchTerms[i].booleanAnd) {
        if (priorTerm != null) {
          firstDJTerm = i - 1;
          priorTerm.beginsGrouping = true;
        }
      } else {
        if (firstDJTerm != -1) {
          priorTerm.endsGrouping = true;
          firstDJTerm = -1;
        }
      }
      priorTerm = searchTerms[i];
    }
    if (firstDJTerm != -1) {
      priorTerm.endsGrouping = true;
      firstDJTerm = -1;
    }
    ExpressionSearchLog.info("Expression Search Terms: "+this.getSearchTermString(searchTerms));
    return null;
  },
  
} // end of ExperssionSearchFilter define
QuickFilterManager.defineFilter(ExperssionSearchFilter);
QuickFilterManager.textBoxDomId = ExperssionSearchFilter.domId;

