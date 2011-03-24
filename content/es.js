// Original by Ken Mixter for GMailUI, which is "GMailUI is completely free to use as you wish."
// Opera Wang, 2010/1/15
// GPL V3 / MPL

if ( 'undefined' == typeof(ExpressionSearchChrome) ) {
    var ExpressionSearchChrome = {
      // inited, also used as ID for the instance
      isInited:0,

      // request to create virtual folder
      latchQSFolderReq: 0,
      
      // if last key is Enter
      isEnter: 0,
      
      allTokens: "simple|from|f|to|t|subject|s|all|body|b|attachment|a|tag|label|l|status|u|is|i|before|be|after|af",
      needMoveIds: ["qfb-sticky", "quick-filter-bar-collapsible-buttons", "qfb-results-label", "expression-search-textbox"],
      collapsibleButtons: ["qfb-unread", "qfb-starred", "qfb-inaddrbook", "qfb-tags", "qfb-attachment"],
      textBoxDomId: "expression-search-textbox",
      
      prefs: null, // preference object
      options: {   // preference strings
        savedPosition: 0,
      },

      init: function() {
        try {
          if ( this.isInited == 0 ) {
            ExpressionSearchLog.log("Expression Search: init...");
            this.isInited = new Date().getTime();
            this.importModules();
            this.initPerf();
            this.initSearchInput();
            this.initFunctionHook();
          } else {
            ExpressionSearchLog.log("Expression Search:Warning, init again",1);
          }
        } catch (err) {
          ExpressionSearchLog.logException(err);
        }
      },
      
      importModules: function() {
        this.Cu = Components.utils;
        this.Ci = Components.interfaces;
        //this.Cc = Components.classes;
        //this.Cr = Components.results;
        this.Cu.import("resource://expressionsearch/gmailuiParse.js");
        this.Cu.import("resource:///modules/quickFilterManager.js");
        this.Cu.import("resource:///modules/StringBundle.js");
        // for create quick search folder
        this.Cu.import("resource:///modules/virtualFolderWrapper.js");
        this.Cu.import("resource:///modules/iteratorUtils.jsm");
        // need to know whehter gloda enabled
        this.Cu.import("resource:///modules/gloda/indexer.js");
        // to call gloda search, actually no need
        //Cu.import("resource:///modules/gloda/msg_search.js");
      },
      
      initPerf: function() {
        this.prefs = Components.classes["@mozilla.org/preferences-service;1"]
             .getService(Components.interfaces.nsIPrefService)
             .getBranch("extensions.expressionsearch.");
        this.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
        this.prefs.addObserver("", this, false);
        try {
          this.options.hide_normal_filer = this.prefs.getBoolPref("hide_normal_filer");
          this.options.hide_filter_label = this.prefs.getBoolPref("hide_filter_label");
          this.options.reuse_existing_folder = this.prefs.getBoolPref("reuse_existing_folder");
          this.options.select_msg_on_enter = this.prefs.getBoolPref("select_msg_on_enter");
          this.options.move2bar = this.prefs.getIntPref("move2bar"); // 0:keep, 1:toolbar, 2:menubar
          this.options.c2s_enableCtrl = this.prefs.getBoolPref("c2s_enableCtrl");
          this.options.c2s_enableShift = this.prefs.getBoolPref("c2s_enableShift");
          this.options.c2s_regexpMatch = this.prefs.getComplexValue('c2s_regexpMatch',this.Ci.nsISupportsString).data;
          this.options.c2s_regexpReplace = this.prefs.getComplexValue('c2s_regexpReplace',this.Ci.nsISupportsString).data;
        } catch ( err ) {
          ExpressionSearchLog.logException(err);
        }
      },
      
      // get called when event occurs with our perf branch
      observe: function(subject, topic, data) {
        if (topic != "nsPref:changed") {
           return;
         }
         switch(data) {
           case "hide_normal_filer":
           case "hide_filter_label":
           case "reuse_existing_folder":
           case "select_msg_on_enter":
           case "c2s_enableCtrl":
           case "c2s_enableShift":
             this.options[data] = this.prefs.getBoolPref(data);
             break;
           case "move2bar":
             this.options[data] = this.prefs.getIntPref(data);
             break;
           case "c2s_regexpMatch":
           case "c2s_regexpReplace":
             this.options[data] = this.prefs.getComplexValue(data,this.Ci.nsISupportsString).data;
             break;
         }
         if ( data=='hide_normal_filer' || data=='hide_filter_label' || data == 'move2bar' )
           this.refreshFilterBar();
      },
      
      initFunctionHook: function() {
        if ( typeof(QuickFilterBarMuxer) == 'undefined' || typeof(QuickFilterBarMuxer.reflectFiltererState) == 'undefined' )
          return;
        QuickFilterBarMuxer.reflectFiltererStateSaved = QuickFilterBarMuxer.reflectFiltererState;
        QuickFilterBarMuxer.reflectFiltererState = function(aFilterer, aFolderDisplay, aFilterName) {
          let show = ( ExpressionSearchChrome.options.move2bar==0 || !ExpressionSearchChrome.options.hide_normal_filer );
          let hasFilter = typeof(this.maybeActiveFilterer)=='object';
          // filter bar not need show, so hide mainbar(in refreshFilterBar) and show quick filter bar
          if ( !show  && !aFilterer.visible && hasFilter ) aFilterer.visible = true;
          QuickFilterBarMuxer.reflectFiltererStateSaved.apply(QuickFilterBarMuxer,arguments);
        }
        
        // onMakeActive
        QuickFilterBarMuxer.onMakeActiveSaved = QuickFilterBarMuxer.onMakeActive;
        QuickFilterBarMuxer.onMakeActive = function(aFolderDisplay) {
          let tab = aFolderDisplay._tabInfo;
          let appropriate = ("quickFilter" in tab._ext) && aFolderDisplay.displayedFolder && !aFolderDisplay.displayedFolder.isServer;
          ExpressionSearchChrome.needMoveIds.concat(ExpressionSearchChrome.collapsibleButtons).forEach( function(ID, index, array) {
            //document.getElementById(ID).disabled = appropriate ? false: true;
            document.getElementById(ID).style.visibility = appropriate ? 'visible': 'hidden';
          } );
          QuickFilterBarMuxer.onMakeActiveSaved.apply(this,arguments);
        }
        
        // work around https://bugzilla.mozilla.org/show_bug.cgi?id=644079
        if ( typeof(QuickFilterManager.killFilterSaved) == 'undefined' ) {
          QuickFilterManager.killFilterSaved = QuickFilterManager.killFilter;
          QuickFilterManager.killFilter = function MFM_killFilterNew(aName) {
            let filterDef = this.filterDefsByName[aName];
            this.filterDefs.splice(this.filterDefs.indexOf(filterDef), 1);
            delete this.filterDefsByName[aName];
          }
        }
      },

      unregister: function() {
        ExpressionSearchLog.log("Expression Search: unload...");
        ExpressionSearchChrome.prefs.removeObserver("", ExpressionSearchChrome);
        var aNode = document.getElementById(ExpressionSearchChrome.textBoxDomId);
        if (aNode) {
            aNode.removeEventListener("keypress", ExpressionSearchChrome.onSearchKeyPress, true);
            aNode.removeEventListener("blur", ExpressionSearchChrome.hideUpsellPanel, true);
        }
        // remove our filter from the QuickFilterManager
        QuickFilterManager.killFilter('expression'+ExpressionSearchChrome.isInited); //Remove a filter from existence by name
        //comment the below line so I'm still active after 1 window closed
        //QuickFilterManager.textBoxDomId = ExpressionSearchChrome.textBoxDomIdSaved;
        let threadPane = document.getElementById("threadTree");
        if ( threadPane )
          threadPane.RemoveEventListener("click", ExpressionSearchChrome.onClicked, true);
        if ( typeof(QuickFilterBarMuxer.reflectFiltererStateSaved) != 'undefined' ) {
          QuickFilterBarMuxer.reflectFiltererState = QuickFilterBarMuxer.reflectFiltererStateSaved;
          QuickFilterBarMuxer.onMakeActive = QuickFilterBarMuxer.onMakeActiveSaved;
        }
        window.removeEventListener("load", ExpressionSearchChrome.initAfterLoad, false);
        window.removeEventListener("unload", ExpressionSearchChrome.unregister, false);
      },
      
      refreshFilterBar: function() {
        //thunderbird-private-tabmail-buttons
        //  qfb-show-filter-bar  : document.getElementById("qfb-show-filter-bar").checked = aFilterer.visible;
      
        //quick-filter-bar
        //  quick-filter-bar-main-bar
        //  quick-filter-bar-expando
        //    quick-filter-bar-tab-bar : it's taG bar
        //    quick-filter-bar-filter-text-bar.collapsed=(aFilterValue.text == null);
        
        //qfb-sticky [quick-filter-bar-collapsible-buttons] [100 results] [search filter]
        //                                          subject ...
        
        //QuickFilterState.visible
        
        //QuickFilterBarMuxer
        //  onMakeActive for qfb-show-filter-bar visiable
        //  reflectFiltererState for qfb-show-filter-bar checked
        let filterNode = document.getElementById('qfb-qs-textbox');
        if ( filterNode && filterNode.style ) {
          filterNode.style.display = this.options.hide_normal_filer ? 'none' : '';
        }
        if ( filterNode && ExpressionSearchChrome.options.hide_normal_filer ) // hide normal filter, so reset it
          filterNode.value = '';
        let filterLabel = document.getElementById('qfb-filter-label');
        if ( filterLabel && filterLabel.style ) {
          filterLabel.style.display = this.options.hide_filter_label ? 'none' : '';
        }
        let spacer = document.getElementById('qfb-filter-bar-spacer');
        if ( spacer ) {
          spacer.flex = this.options.hide_filter_label ? 1 : 200;
        }
        let show = ( this.options.move2bar==0 || !this.options.hide_normal_filer );
        let mainbar = document.getElementById("quick-filter-bar-main-bar");
        mainbar.collapsed = show ? false: true; // only me will change mainbar status, TB won't

        // move expression search box along with other buttons to dest position
        if ( this.options.move2bar == this.options.savedPosition ) return;
        let dest = "quick-filter-bar-main-bar";
        let reference = null;
        if ( this.options.move2bar == 0 )
          reference = document.getElementById("qfb-filter-label");
        else if ( this.options.move2bar == 1 )
          dest = 'mail-bar3';
        else if ( this.options.move2bar == 2 )
          dest = 'mail-toolbar-menubar2';
        var toolbar = document.getElementById(dest);
        var i = 0;
        while ( i < this.needMoveIds.length ) {
            var needMove = document.getElementById(this.needMoveIds[i]);
            toolbar.insertBefore(needMove.parentNode.removeChild(needMove), reference);
            i++;
            if ( this.options.move2bar == 0 )
              if ( i == 1 )
                reference = document.getElementById("qfb-filter-bar-spacer");
              else if ( i == 2 )
                reference = document.getElementById("qfb-qs-textbox");
              else if ( i == 3 )
                reference = null;
        }
        this.options.savedPosition = this.options.move2bar;
      },
      
      hideUpsellPanel: function() {
        let panel = document.getElementById("qfb-text-search-upsell");
        if ( panel.state == "open")
          panel.hidePopup();
      },
      
      expression2gloda: function(searchValue) {
        searchValue = searchValue.replace(/^g:\s*/i,'');
        let regExp = new RegExp( "(?:^|\\b)(?:" + this.allTokens + "):", "g");
        //searchValue = searchValue.replace(/(?:^|\b)(?:from|f|to|t|subject|s|all|body|b|attachment|a|tag|label|l|status|u|is|i|before|be|after|af):/g,'');
        searchValue = searchValue.replace(regExp,'');
        searchValue = searchValue.replace(/(?:\b|^)(?:and|or)(?:\b|$)/g,'').replace(/[()]/g,'');
        return searchValue;
      },
      
      onSearchKeyPress: function(event){
        ExpressionSearchChrome.isEnter = 0;
        if ( event && ( ( event.DOM_VK_RETURN && event.keyCode==event.DOM_VK_RETURN ) || ( event.DOM_VK_ENTER && event.keyCode==event.DOM_VK_ENTER ) ) ) {
          ExpressionSearchChrome.isEnter = 1;
          let panel = document.getElementById("qfb-text-search-upsell");
          let searchValue = this.value; // this is aNode/my search text box
          if ( typeof(searchValue) != 'undefined' && searchValue != '' ) {
            if ( GlodaIndexer.enabled && ( panel.state=="open" || event.shiftKey || searchValue.toLowerCase().indexOf('g:') == 0 ) ) { // gloda
              searchValue = ExpressionSearchChrome.expression2gloda(searchValue);
              if ( searchValue != '' ) {
                //this._fireCommand(this); // just for selection, but no use as TB will unselect it
                let tabmail = document.getElementById("tabmail");
                tabmail.openTab("glodaFacet", {
                  searcher: new GlodaMsgSearcher(null, searchValue)
                });
              }
            } else if ( event.ctrlKey || event.metaKey ) { // create quick search folder
              ExpressionSearchChrome.latchQSFolderReq = 1;
              this._fireCommand(this);
            } else {
              var e = compute_expression(searchValue);
              if (e.kind == 'spec' && e.tok == 'calc') {
                ExpressionSearchChrome.isEnter = 0; // showCalculationResult also will select the result.
                ExpressionSearchChrome.showCalculationResult(e);
              }
            }
          }
        } // end of IsEnter
        ExpressionSearchChrome.hideUpsellPanel(); // hide the panel when key press
        // -- Keypresses for focus transferral
        if ( event && event.DOM_VK_DOWN && ( event.keyCode == event.DOM_VK_DOWN ) )
          ExpressionSearchChrome.selectFirstMessage(true);
      },

      initSearchInput: function() {
        /**
         * MessageTextFilter didn't want me to extend it much, so I have to define mine.
        */
        
        let ExpressionFilter = {
          name: "expression",
          domId: ExpressionSearchChrome.textBoxDomId,

          appendTerms: function(aTermCreator, aTerms, aFilterValue) {
            if (aFilterValue.text) {
              try {
                if ( aFilterValue.text.toLowerCase().indexOf('g:') == 0 ) { // may get called when init with saved values in searchInput.
                  return;
                }
                // check if in normal filter mode
                if ( 1 && aFilterValue.text ) {
                  // Use normalFilter's appendTerms to create search term
                  ExpressionSearchLog.logObject(QuickFilterBarMuxer.activeFilterer.filterValues,'QuickFilterBarMuxer.activeFilterer.filterValues',0);
                  let normalFilterState = QuickFilterBarMuxer.activeFilterer.filterValues['text'];
                  ExpressionSearchLog.logObject(normalFilterState,'normalFilterState',1);
                  let originalText = normalFilterState.text;
                  normalFilterState.text = aFilterValue.text;
                  let normalFilter = QuickFilterManager.filterDefsByName['text'];
                  normalFilter.appendTerms.apply(normalFilter, [aTermCreator, aTerms, normalFilterState]);
                  normalFilterState.text = originalText;
                  return;
                }
                
                // first remove trailing specifications if it's empty
                // then remove trailing ' and' but no remove of "f: and"
                let regExpReplace = new RegExp( '(?:^|\\s+)(?:' + ExpressionSearchChrome.allTokens + '):(?:\\(|)\\s*$', "i");
                let regExpSearch = new RegExp( '\\b(?:' + ExpressionSearchChrome.allTokens + '):\\s+and\\s*$', "i");
                var aSearchString = aFilterValue.text.replace(regExpReplace,'');
                if ( !regExpSearch.test(aSearchString) ) {
                  aSearchString = aSearchString.replace(/\s+\and\s*$/i,'');
                }
                aSearchString.replace(/\s+$/,'');
                if ( aSearchString == '' ) {
                  return;
                }
                var e = compute_expression(aSearchString);
                if ( ExpressionSearchChrome.latchQSFolderReq ) {
                  let terms = aTerms.slice();
                  ExpressionSearchChrome.createSearchTermsFromExpression(e,aTermCreator,terms);
                  ExpressionSearchChrome.createQuickFolder(terms);
                  ExpressionSearchChrome.latchQSFolderReq = 0;
                } else {
                  ExpressionSearchLog.log("Experssion Search Statements: "+expr_tostring_infix(e));
                  ExpressionSearchChrome.createSearchTermsFromExpression(e,aTermCreator,aTerms);
                }
                return;
              } catch (err) {
                ExpressionSearchLog.logException(err);
              }
            }
          },

          domBindExtra: function(aDocument, aMuxer, aNode) {
            /*
            if ( 'undefined' == typeof(ExpressionSearchChrome) ) {
              // If this filter was NOT removed from the quickFilterManager and closed Mail window and re-open Mail window
              return; 
            }*/
            // -- platform-dependent emptytext setup
            let filterNode = aDocument.getElementById('qfb-qs-textbox');
            let quickKey = '';
            let attributeName = "emptytext"; // for 3.1
            if ( filterNode && typeof(Application)!='undefined' ) {
              if ( filterNode.hasAttribute("placeholder") )
                attributeName = "placeholder"; // for 3.3
              quickKey = filterNode.getAttribute(Application.platformIsMac ? "keyLabelMac" : "keyLabelNonMac");
              // now Ctrl+F will focus to our input, so remove the message in this one
              filterNode.setAttribute( attributeName, filterNode.getAttribute("emptytextbase").replace("#1", '') );
              // force to update the message
              filterNode.value = '';
            }
            aNode.setAttribute( attributeName, aNode.getAttribute("emptytextbase").replace("#1", quickKey) );
            // force an update of the emptytext now that we've updated it.
            aNode.value = "";
            if ( aNode && aNode._fireCommand ) {
              aNode.addEventListener("keypress", ExpressionSearchChrome.onSearchKeyPress, true); // false will be after onComand, too later, 
              aNode.addEventListener("blur", ExpressionSearchChrome.hideUpsellPanel, true);
            }
          },

          getDefaults: function() { // this function get called pretty early
            return {
              text: null,
            };
          },

          propagateState: function(aOld, aSticky) {
            return {
              // must clear state when create quick search folder, or recursive call happenes when aSticky.
              text: ( aSticky && !ExpressionSearchChrome.latchQSFolderReq )? aOld.text : null,
              //states: {},
            };
          },

          onCommand: function(aState, aNode, aEvent, aDocument) { // may get skipped when init, but appendTerms get called
            let text = aNode.value.length ? aNode.value : null;
            aState = aState || {}; // or will be no search.
            let needSearch = false;
            if ( ExpressionSearchChrome.isEnter ) {
              // press Enter to select searchInput
              aNode.select();
              // if text not null and create qs folder return true
              if ( text && ExpressionSearchChrome.latchQSFolderReq ) {
                needSearch = true;
              }
            }
            if ( text != aState.text ) {
              aState.text = text;
              needSearch = true;
            }
            if ( !needSearch && ExpressionSearchChrome.isEnter && ExpressionSearchChrome.options.select_msg_on_enter ) // else the first message will be selected in reflectInDom
                ExpressionSearchChrome.selectFirstMessage(true);
            return [aState, needSearch];
          },

          // change DOM status, eg disabled, checked, etc.
          reflectInDOM: function(aNode, aFilterValue,
                                aDocument, aMuxer,
                                aFromPFP) { //PFP: PostFilterProcess, the second value PFP returns
            // Update the text if it has changed (linux does weird things with empty
            //  text if we're transitioning emptytext to emptytext)
            let desiredValue = "";
            if ( aFilterValue && aFilterValue.text )
              desiredValue = aFilterValue.text;
            if ( aNode.value != desiredValue && !aFromPFP )
              aNode.value = desiredValue;

            let panel = aDocument.getElementById("qfb-text-search-upsell");
            if (aFromPFP == "upsell") {
              let searchString = ExpressionSearchChrome.expression2gloda(aFilterValue.text);
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
            if (!aFiltering || !aState || !aState.text || !aViewWrapper || aViewWrapper.dbView.numMsgsInView || !GlodaIndexer.enabled)
              return [aState, "nosale", false];

            // since we're filtering, filtering on text, and there are no results, tell
            //  the upsell code to get bizzay
            return [aState, "upsell", false];
          },
        };

        ExpressionFilter.name += ExpressionSearchChrome.isInited; // for multi window, use different name
        QuickFilterManager.defineFilter(ExpressionFilter);
        //ExpressionSearchChrome.textBoxDomIdSaved = QuickFilterManager.textBoxDomId;
        QuickFilterManager.textBoxDomId = ExpressionFilter.domId;
      },
      
      // select first message, expand first container if closed
      selectFirstMessage: function(needSelect) {
        if ( typeof(gFolderDisplay)!='undefined' && gFolderDisplay.tree && gFolderDisplay.tree.treeBoxObject && gFolderDisplay.tree.treeBoxObject.view ) {
          let treeBox = gFolderDisplay.tree.treeBoxObject; //nsITreeBoxObject
          let treeView = treeBox.view; //nsITreeView
          let dbViewWrapper = gFolderDisplay.view; // DBViewWrapper
          let aNode = document.getElementById(ExpressionSearchChrome.textBoxDomId);
          if ( aNode && treeView && dbViewWrapper && treeView.rowCount > 0 ) {
            if ( treeView.isContainer(0) && !treeView.isContainerOpen(0))
              treeView.toggleOpenState(0);
            if ( needSelect ) {
              let threadPane = document.getElementById("threadTree");
              // focusing does not actually select the row...
              threadPane.focus();
              // ...so explicitly select the currentIndex if avaliable or the 1st one
              //threadPane.view.selection.select(threadPane.currentIndex);
              var row = treeView.isContainer(0)&&dbViewWrapper.showGroupedBySort ? 1 : 0;
              treeView.selection.select(row);
              treeBox.ensureRowIsVisible(row);
            } // needSelect
          } // rowCount > 0
        }
        ExpressionSearchChrome.isEnter = false;
      },
      
      // not works well for complex searchTerms. But it's for all folders.
      createQuickFolder: function(searchTerms) {
        const nsMsgFolderFlags = this.Ci.nsMsgFolderFlags;
        var currFolder = gFolderDisplay.displayedFolder;
        var currURI = currFolder.URI;
        var rootFolder = currFolder.rootFolder;
        var QSFolderName = "ExpressionSearch";
        var uriSearchString = "";
        if (!rootFolder) {
          alert('Expression Search: Cannot determine root folder of search');
          return;
        }
        var QSFolderURI = rootFolder.URI + "/" + QSFolderName;
        
        if ( !rootFolder.containsChildNamed(QSFolderName) || ! this.options.reuse_existing_folder ) {
          var allFolders = Components.classes["@mozilla.org/supports-array;1"].createInstance(Components.interfaces.nsISupportsArray);
          rootFolder.ListDescendents(allFolders);
          var numFolders = allFolders.Count();
          for (var folderIndex = 0; folderIndex < numFolders; folderIndex++) {
            var folder = allFolders.GetElementAt(folderIndex).QueryInterface(Components.interfaces.nsIMsgFolder);
            var uri = folder.URI;
            // only add non-virtual non-new folders
            if ( !folder.isSpecialFolder(nsMsgFolderFlags.Newsgroup,false) && !folder.isSpecialFolder(nsMsgFolderFlags.Virtual,false) ) {
              if (uriSearchString != "") {
                uriSearchString += "|";
              }
              uriSearchString += uri;
            }
          }
        }

        //Check if folder exists already
        if (rootFolder.containsChildNamed(QSFolderName)) {
          // modify existing folder
          var msgFolder = GetMsgFolderFromUri(QSFolderURI);
          if (!msgFolder.isSpecialFolder(nsMsgFolderFlags.Virtual,false)) {
            alert('Expression Search: Non search folder '+QSFolderName+' is in the way');
            return;
          }
          // save the settings
          let virtualFolderWrapper = VirtualFolderHelper.wrapVirtualFolder(msgFolder);
          virtualFolderWrapper.searchTerms = searchTerms;
          if ( ! this.options.reuse_existing_folder ) {
            virtualFolderWrapper.searchFolders = uriSearchString;
          }
          virtualFolderWrapper.onlineSearch = false;
          virtualFolderWrapper.cleanUpMessageDatabase();
          var accountManager = Components.classes["@mozilla.org/messenger/account-manager;1"].getService(Components.interfaces.nsIMsgAccountManager);
          accountManager.saveVirtualFolders();
        } else {
          VirtualFolderHelper.createNewVirtualFolder(QSFolderName, rootFolder, uriSearchString, searchTerms, false);
        }

        if (currURI == QSFolderURI) {
          // select another folder to force reload of our virtual folder
          SelectFolder(rootFolder.getFolderWithFlags(nsMsgFolderFlags.Inbox).URI);
        }
        SelectFolder(QSFolderURI);
      },
      
      addSearchTerm: function(aTermCreator, searchTerms, str, attr, op, is_or, grouping) {
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
        else if (attr == nsMsgSearchAttrib.Size)
          value.size = str;
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

        //ExpressionSearchLog.log("Expression Search: "+term.termAsString);
        searchTerms.push(term);
      },

      get_key_from_tag: function(myTag) {
        var tagService = Components.classes["@mozilla.org/messenger/tagservice;1"].getService(Components.interfaces.nsIMsgTagService); 
        var tagArray = tagService.getAllTags({});
        var unique = undefined;
        // consider two tags, one is "ABC", the other is "ABCD", when searching for "AB", perfect is return both.
        // however, that need change the token tree.
        // so here I just return the best fit "ABC".
        var myTagLen = myTag.length;
        var lenDiff = 10000000; // big enough?
        for (var i = 0; i < tagArray.length; ++i) {
            var tag = tagArray[i].tag;
            var key = tagArray[i].key;
            tag = tag.toLowerCase();
            if (tag.indexOf(myTag) >= 0 && ( tag.length-myTagLen < lenDiff ) ) {
              unique = key;
              lenDiff = tag.length-myTagLen;
              if ( lenDiff == 0 ) {
                break;
              }
            }
        }
        if (unique != undefined) 
            return unique;
        else
            return "..unknown..";
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
          var attr;
          if (e.tok == 'from') attr = nsMsgSearchAttrib.Sender;
          else if (e.tok == 'to') attr = nsMsgSearchAttrib.ToOrCC;
          else if (e.tok == 'subject' || e.tok == 'simple') attr = nsMsgSearchAttrib.Subject;
          else if (e.tok == 'body') attr = nsMsgSearchAttrib.Body;
          else if (e.tok == 'attachment') attr = nsMsgSearchAttrib.HasAttachmentStatus;
          else if (e.tok == 'status') attr = nsMsgSearchAttrib.MsgStatus;
          else if (e.tok == 'before' || e.tok == 'after') attr = nsMsgSearchAttrib.Date;
          else if (e.tok == 'tag') {
            e.left.tok = this.get_key_from_tag(e.left.tok);
            attr = nsMsgSearchAttrib.Keywords;
          } else if (e.tok == 'calc' ) {
            return;
          } else {ExpressionSearchLog.log('Exression Search: unexpected specifier',1); return; }
          var op = is_not ? nsMsgSearchOp.DoesntContain:nsMsgSearchOp.Contains;
          if (e.left.kind != 'str') {
            ExpressionSearchLog.log('Exression Search: unexpected expression tree',1);
            return;
          }
          if (e.tok == 'attachment') {
            if (!/^[Yy1]/.test(e.left.tok)) {
              // looking for no attachment; reverse is_noto.
              is_not = !is_not;
            }
          }
          if ( attr == nsMsgSearchAttrib.Date) {
            // is before: before => false, true: true
            // is after: after   => false, false: false
            // isnot before: after => true, ture: false
            // isnot after: before => true, false: true
            op = (is_not^(e.tok=='before')) ? nsMsgSearchOp.IsBefore : nsMsgSearchOp.IsAfter;
            var date;
            try {
              var inValue = e.left.tok;
              date = new Date(inValue);
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
            else if (/^F/i.test(e.left.tok))
              e.left.tok = nsMsgMessageFlags.Forwarded;
            else if (/^A/i.test(e.left.tok))
              e.left.tok = nsMsgMessageFlags.Attachment;
            else if (/^UnR/i.test(e.left.tok)) {
              e.left.tok = nsMsgMessageFlags.Read;
              is_not = !is_not;
            } else {
              ExpressionSearchLog.log('Exression Search: unknown status '+e.left.tok,1);
              return;
            }
          }
          if (e.tok == 'attachment' || e.tok == 'status') {
            op = is_not ? nsMsgSearchOp.Isnt : nsMsgSearchOp.Is;
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
        function getSearchTermString(searchTerms) {
          let condition = "";
          searchTerms.forEach( function(searchTerm, index, array) {
            if (index > 0) condition += " ";
            if (searchTerm.matchAll)
              condition += "ALL";
            else {
              condition += searchTerm.booleanAnd ? "AND" : "OR";
              condition += searchTerm.beginsGrouping && !searchTerm.endsGrouping ? " (" : "";
            }
            condition += " (" + searchTerm.termAsString + ")";
            // ")" may not balanced with "(", but who cares
            condition += searchTerm.endsGrouping && !searchTerm.beginsGrouping ? " )" : "";
          } );
          return condition;
        }
        ExpressionSearchLog.log("Experssion Search Terms: "+getSearchTermString(searchTerms));
        return null;
      },

      calculateResult: function(e) {
        if (e.kind == 'op') {
          if (e.tok == '+' || (e.right != undefined && e.tok == '-') || e.tok == '*' || e.tok == '/') {
            var r1 = this.calculateResult(e.left);
            var r2 = this.calculateResult(e.right);
            if (r1.kind == 'error')
              return r1;
            else if (r2.kind == 'error')
              return r2;
            else {
              if (e.tok == '+')
                return { kind: 'num', tok: r1.tok+r2.tok };
              else if (e.tok == '-')
                return { kind: 'num', tok: r1.tok-r2.tok };
              else if (e.tok == '*')
                return { kind: 'num', tok: r1.tok*r2.tok };
              else if (e.tok == '/') {
                // divide by zero is okay, it just results in infinity
                return { kind: 'num', tok: r1.tok/r2.tok };
              }
            }
          } else if (e.tok == '-') {
            var r1 = calculateResult(e.left);
            if (r1.kind == 'error')
              return r1;
            else
              return { kind: 'num', tok: -r1.tok };
          }
        } else if (e.kind == 'num') {
          return e;
        } else {
          ExpressionSearchLog.log('Expression Search: unexpected expression tree when calculating result',1);
          return { kind: 'error', tok: 'internal' };
        }
      },

      showCalculationResult: function(e) {
        e = e.left; // skip the calc: specifier
        // compute the result of this calculation
        var r = this.calculateResult(e);
        // print the expression,
        var lhs = expr_tostring_infix(e);
        var rhs = '' + ((r.kind == 'num') ? r.tok : "<<ERROR: "+r.tok+">>");
        var x = document.getElementById('expression-search-textbox');
        x.value = lhs + " = " + rhs;
        x.setSelectionRange(lhs.length, lhs.length + rhs.length + 3);
      },
      
      //Check conditions for search: corresponding modifier is hold on or middle button is pressed
      CheckClickSearchEvent: function( event ) {
        // event.button: 0:left, 1:middle, 2:right
        if ( event.button != 2 ) return false;
        if ( ExpressionSearchChrome.options.c2s_enableCtrl && event.ctrlKey ) return true;
        if ( ExpressionSearchChrome.options.c2s_enableShift && event.shiftKey ) return true;
        return false;
      },
      
      //Replace string using user-defined regexp. If not match, return original strings. 
      //If multiple matches, return all replaces, concatinated with OR operator
      RegexpReplaceString : function( str ) {
          if ( ExpressionSearchChrome.options.c2s_regexpMatch.length == 0 ) return str;
          var regexp = new RegExp(ExpressionSearchChrome.options.c2s_regexpMatch, "gi");
          var r_match = str.match(regexp);
          if ( !r_match ) return str;
          var res = new Array();
          for (i = 0; i < r_match.length; i++ ) {
              res.push( r_match[i].replace(regexp, ExpressionSearchChrome.options.c2s_regexpReplace) );
          }
          var out = res.join(" or ");
          if ( res.length > 1)
            out = "(" + out + ")";
          return out;
      },
      
      onClicked: function(event) {
        if ( !event.currentTarget || !event.currentTarget.treeBoxObject || !event.currentTarget.view ) return;
        let aNode = document.getElementById(ExpressionSearchChrome.textBoxDomId);
        if ( !aNode ) return;
        if ( ! ExpressionSearchChrome.CheckClickSearchEvent(event) ) return;
        var row = {}; var col = {}; var childElt = {};
        event.currentTarget.treeBoxObject.getCellAt(event.clientX, event.clientY, row, col, childElt);
        if ( !row || !col || typeof(row.value)=='undefined' || typeof(col.value)=='undefined' ) return;
        // col.value.id: subjectCol, senderCol, recipientCol (may contains multi recipient, Comma Seprated), tagsCol, sio_inoutaddressCol (ShowInOut)
        let token = "";
        let sCellText = event.currentTarget.view.getCellText(row.value, col.value);
        switch(col.value.id) {
           case "subjectCol":
             sCellText = ExpressionSearchChrome.RegexpReplaceString( sCellText );
             token = "simple";
             if ( sCellText.indexOf("(") == 0 )
               token = "s";
             let oldValue = "";
             while ( oldValue != sCellText ) {
               oldValue = sCellText;
               [/^\s*\S{2,3}(?::|：)\s*(.*)$/, /^\s*\[.+\]:*\s*(.*)$/, /^\s+(.*)$/].forEach( function(element, index, array) {
                 sCellText = sCellText.replace(element, '$1');
               });
             }
             break;
           case "senderCol":
             token = "f";
             break;
           case "recipientCol":
             token = "t";
             //break;
           case "sio_inoutaddressCol": //showInOut support
             if ( token == "" && gFolderDisplay && gFolderDisplay.tree && gFolderDisplay.tree.treeBoxObject ) { // not recipientCol
               let treeBox = gFolderDisplay.tree.treeBoxObject; //nsITreeBoxObject
               let treeView = treeBox.view;
               var property = Components.classes["@mozilla.org/supports-array;1"].createInstance(Components.interfaces.nsISupportsArray);
               var atomIn = Components.classes["@mozilla.org/atom-service;1"].getService(Components.interfaces.nsIAtomService).getAtom('in');
               treeView.getCellProperties(row.value,col.value,property);
               token = property.GetIndexOf(atomIn) >= 0 ? "f" : "t";
             }
             sCellText = sCellText.replace(/'/g, '');
             // and, or, 1st, mouse position?
             if ( sCellText.indexOf(',') != -1 ) {
               sCellText = sCellText.replace(/,/g, ' and');
               sCellText = "(" + sCellText + ")";
             }
             break;
           case "tagsCol":
             token = "tag";
             sCellText = sCellText.replace(/\s+/g, ' and '); //maybe not correct for "To Do"
             sCellText = "(" + sCellText + ")";
             break;
           default:
             return;
        }
        if ( sCellText == "" ) return;
        if ( ExpressionSearchChrome.options.move2bar==0 && ( !QuickFilterBarMuxer.activeFilterer.visible || document.commandDispatcher.focusedElement != aNode.inputField ) )
          QuickFilterBarMuxer._showFilterBar(true);
        ExpressionSearchLog.log(token + ":" + sCellText);
        aNode.value = token + ":" + sCellText;
        ExpressionSearchChrome.isEnter = true; // So the email can be selected
        aNode._fireCommand(aNode);
        // Stop even bubbling
        event.preventDefault();
        event.stopPropagation();
      },
      
      initAfterLoad: function() {
        ExpressionSearchChrome.refreshFilterBar();
        let threadPane = document.getElementById("threadTree");
        if ( threadPane )
          threadPane.addEventListener("click", ExpressionSearchChrome.onClicked, true);
      },

    };
    
    //onload is too late for me to init
    // this is much complex than 'ExpressionSearchChrome.init();' and both works ;-)
    (function() { this.init(); }).apply(ExpressionSearchChrome);
    window.addEventListener("load", ExpressionSearchChrome.initAfterLoad, false);
    window.addEventListener("unload", ExpressionSearchChrome.unregister, false);
};

// TODO:
// use https://developer.mozilla.org/en/STEEL ? maybe not