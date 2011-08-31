// (c) 2005 Ken Mixter
// Original by Ken Mixter for GMailUI, which is "GMailUI is completely free to use as you wish."
/* Changed by Opera Wang
    Added status/u/is/i pattern
    Added before/after pattern
    Added simple pattern
    Added regex pattern
    Added filename pattern
    Added date pattern
    if ":" seems like within normal string, advance without break.
    removed toLowerCase
*/

var EXPORTED_SYMBOLS = ["compute_expression", "expr_tostring_infix"];

////////// Tokenize

function ADVANCE_TOKEN() {
  // Added by Opera for simple/regex token, the remaining str will be treated as one str
  // For simple/regex, there's no '-' operation
  var currentToken = this.next_token ? this.next_token.tok : "";
  if ( currentToken == 'simple' || currentToken == 'regex' ) {
    this.next_token = {
      kind: 'str',
      tok:this.str
    }
    this.str = "";
    return;
  }

  // skip white
  this.str = this.str.replace(/^\s+(.*)/,"$1");
  if (!this.str.length) {
    // end reached (possibly again)
    this.next_token = { kind: "", tok: "" };
    return;
  }

  // in token, determine what kind from first char.
  if (this.str[0] == '(' || this.str[0] == ')' ||
      this.str[0] == '-') {
    var tok = this.str[0];
    this.str = this.str.substr(1);
    this.next_token = {
        kind: tok == '-' ? "op" : "g",
        tok: tok
    };
    return;
  }

  // calculator only: handle all math single-character operator tokens
  if (this.calc) {
      if ((this.str[0] == '+' || 
	   this.str[0] == '*' || this.str[0] == '/')) {
	  var tok = this.str[0];
	  this.str = this.str.substr(1);
	  this.next_token = {
	      kind: "op",
	      tok: tok
	  };
	  return;
      }
      if (this.str[0] == '=') {
	  // treat = like end of string
	  this.next_token = { kind: "", tok: "" };
	  return;
      }
  }

  if (this.str[0] == '"') {
    var tok = "";
    this.cant_be_calc = true;
    this.str=this.str.substr(1); // skip start quote
    while (this.str.length && this.str[0] != '"') {
      tok+=this.str[0];
      this.str = this.str.substr(1);
    }
    this.str=this.str.substr(1); // skip end quote
    this.next_token = {
        kind: 'str',
        tok: tok
    };
    return;
  }

  // not a single-char token, so scan it all in.
  var tok = "";
  let allTokens = /^(?:simple|regex|re|r|date|d|filename|fi|fn|from|f|to|t|subject|s|all|body|b|attachment|a|tag|label|l|status|u|is|i|before|be|after|af)$/;
  if (!this.calc) {
    //Changed the following while loop by Opera: if ":" seems like within normal string, advance without break.
    //while(this.str.length && !/[\s:\(\)]/.test(this.str[0])) {
    while(this.str.length && !/[\s\(\)]/.test(this.str[0])) {
      if ( this.str[0] == ':' && allTokens.test(tok) ) break;
      tok+=this.str[0];
      this.str = this.str.substr(1);
    }
    if (this.cant_be_calc) {
      // don't bother autodetecting calculator expr if disqualified already
    } else if (/[a-zA-Z]/.test(tok)) {
      this.cant_be_calc = true;
    } else if (/[\+\-\*\/\=]/.test(tok)) {
      this.seems_like_calc = true;
    }
  } else {
    while(this.str.length && !/[\s\+\-\*\/\=\(\)]/.test(this.str[0])) {
      tok+=this.str[0];
      this.str = this.str.substr(1);
    }
  }

  // identify special tokens

  if (this.str[0] == ':') {
    this.str = this.str.substr(1);
    if ( allTokens.test(tok) ) {
      if (tok == 'f') tok = 'from';
      if (tok == 't') tok = 'to';
      if (tok == 's') tok = 'subject';
      if (tok == 'b') tok = 'body';
      if (tok == 'a') tok = 'attachment';
      if (tok == 'label') tok = 'tag';
      if (tok == 'l') tok = 'tag';
      if (tok == 'be') tok = 'before';
      if (tok == 'af') tok = 'after';
      if (tok == 'd') tok = 'date';
      if (tok == 'u' || tok == 'is' || tok == 'i' ) tok = 'status';
      if (tok == 're' || tok == 'r') tok = 'regex';
      if (tok == 'fi' || tok == 'fn') tok = 'filename';
      this.next_token = {
        kind: 'spec',
        tok: tok
      };
    } else {
      this.next_token = {
	    kind: 'str',
	    tok: tok+":"
      }
    }
  } else if (tok == 'and' || tok == 'or') {
    this.next_token = {
      kind: 'op',
      tok: tok
    };
  } else {
    this.next_token = {
      kind: 'str',
      tok:tok
    }
  }
}

function TokenizerFactory()
{
  var r = {
    str: "",

    calc: false,                // do calculator tokenization (+/-* are tokens)
    seems_like_calc: false,     // saw some math looking stuff
    cant_be_calc: false,        // saw something that can't be calc

    next_token: undefined,

    f_advance_token: ADVANCE_TOKEN,
    advance_token: function() { this.f_advance_token(); },

    //set_string: function(s) { this.str = s.toLowerCase(); this.advance_token(); },
    set_string: function(s) { this.str = s; this.advance_token(); },
    set_calc_tokenization: function(v) { this.calc = v; },

    peek_token: function() { return this.next_token; },

    is_kind:      function(k) { return this.next_token.kind == k; },
    is_end:       function()      { return this.next_token.kind == ""; },
    is_tok:       function(k,s) 
                                  { return this.next_token.kind == k &&
				           this.next_token.tok == s; },
    get_str:      function()      { return this.next_token.tok; }
  };

  return r;
}


////////// Search expression parser

//
// Grammar supported:
//
// <LEAF_EXPR> := str
//    { kind: 'str', tok: <str> }
// <LEAF_EXPR> := g(() <EXPR> g())
//    grouping effect
// <SPEC_EXPR> := spec(...) <LEAF_EXPR>
//    { kind: 'spec', spec: '...', left: <sexpr> }
// <NOT_EXPR> := op(-)<SPEC_EXPR>
//    { kind: 'op', tok:'-', left: <expr1> }
// <OR_EXPR> := <NOT_EXPR> op(or) <NOT_EXPR>
//    { kind: 'or', left: <expr1>, right: <expr2> }
// <EXPR> := <OR_EXPR> <OR_EXPR> || <OR_EXPR> op(and) <OR_EXPR>
//    { kind: 'op', str:'and', left: <expr1>, right: <expr2> }
//
// There are a few hacks for convenience's sake, such as allowing a
// NOT_EXPR for the LEAF_EXPR in an SPEC_EXPR.  Aka, allow
// the user to do subject:-ambiguous.  Naturally this would be parsed
// as (subject:-) and ambiguous, but that's just too common to allow
// it to be wrong.
// 
//

function parse_expr(T, is_sexpr) {
  //alert('parse_expr');
  var e = parse_or(T,is_sexpr);
  //alert('parse_expr:startloop');
  do {
    if (T.is_tok('g', ')')) {
      T.advance_token();
      break;
    }
    if (T.is_end()) 
      break;
    if (is_sexpr && T.is_kind('spec'))
      break;
    if (T.is_tok('op', 'and'))
      T.advance_token();
    var e2 = parse_or(T,is_sexpr);
    e = { kind: 'op', tok: 'and', left: e, right: e2 };
  } while(1);
  return e;
}

function parse_or(T, is_sexpr) {
  //alert('parse_or');
  var e = parse_not(T,is_sexpr);
  //alert('parse_or:startloop');
  do {
    if (!(T.is_tok('op','or')))
      break;
    T.advance_token();

    if (T.is_end()) break;
    //alert('parse_or:start2nd');
    var e2 = parse_not(T,is_sexpr);
    //alert('parse_or:end2nd');
    e = { kind: 'op', tok: 'or', left: e, right: e2 };
  } while(1);
  return e;
}

function parse_not(T, is_sexpr) {
  var has_not = false;
  if (T.is_tok('op','-')) {
    has_not = true;
    T.advance_token();
  }

  var e = parse_spec(T,is_sexpr);

  if (has_not)
    return { kind: 'op', tok: '-', left: e };
  else
    return e;
}

function parse_spec(T, is_sexpr) {
  //alert('parse_spec');
  if (!is_sexpr && T.is_kind('spec')) {
    var which = T.get_str();
    T.advance_token();
    //var e = parse_expr(T, /*sexpr=*/true);
    var e;
    if (T.is_tok('op','-'))
      e = parse_not(T,is_sexpr);
    else
      e = parse_leaf(T,is_sexpr);
    return { kind: 'spec', tok: which, left: e }
  } else {
    return parse_leaf(T,is_sexpr);
  }
}

function parse_leaf(T, is_sexpr) {
  //alert('parse_leaf');
  if (T.is_tok('g', '(')) {
    T.advance_token();
    return parse_expr(T,/*sexpr=*/false);
  }

  // otherwise we have some string or a non '(' token.  In the
  // latter case there really is some kind of error, but let's
  // not spoil the party, and just pretend that token was
  // meant to be quoted.

  var x = T.next_token;
  T.advance_token();
  x.kind = 'str';

  if (1) {
      // concatenate adjacent strings into one big string.
      // this isn't what google does and isn't what I'd prefer to
      // do, but as long as ands of ors searches fail, let's
      // reduce the 'ands'.  User can still selectively do
      // an and search for non adjacency.
      while(T.next_token.kind == 'str') {
	  x.tok += " "+T.next_token.tok;
	  T.advance_token();
      }
  }

  return x;
}




////////// Calculator expression parser

//
// Calculator grammar supported:
//
// <LEAF_EXPR> := str
//    { kind: 'num', tok: <str> }
// <LEAF_EXPR> := g(() <EXPR> g())
//    grouping effect
// <UNARY_EXPR> := op(-)<LEAF_EXPR>
//    { kind: 'op', tok:'-', left: <expr1> }
// <FACT_EXPR> := <UNARY_EXPR> op(*) <FACT_EXPR> || <UNARY_EXPR> op(/) <FACT_EXPR>
//    { kind: 'op', tok:'+', left: <expr1>, right: <expr2> }
// <EXPR> := <FACT_EXPR> op(+) <EXPR> || <FACT_EXPR> op(-) <EXPR>
//    { kind: 'op', str:'+', left: <expr1>, right: <expr2> }
//
//

function cparse_leaf(T) {
  if (T.is_tok('g', '(')) {
    T.advance_token();
    return cparse_expr(T);
  }

  var x = T.next_token;
  T.advance_token();
  x.kind = 'num';
  x.tok = parseFloat(x.tok);
  //alert('added num '+x.tok);
  return x;
}

function cparse_unary(T) {
  //alert('cparse_unary');
  if (T.is_tok('op', '-')) {
    T.advance_token();
    return { kind:'op', tok:'-', left: cparse_unary(T) };
  } else
    return cparse_leaf(T);
}

function cparse_fact(T) {
  //alert('cparse_fact');
  var e = cparse_unary(T);
  do {
    if (T.is_tok('op', '*') || T.is_tok('op', '/')) {
      var tok = T.get_str();
      T.advance_token();
      var e2 = cparse_unary(T);
      //alert('adding factor');
      e = { kind:'op', tok:tok, left: e, right: e2 };
    } else
      break;
  } while(1);
  return e;
}

function cparse_expr(T) {
  //alert('cparse_expr');
  var e = cparse_fact(T);
  do {
    if (T.is_tok('op', '+') || T.is_tok('op', '-')) {
      var tok = T.get_str();
      T.advance_token();
      var e2 = cparse_fact(T);
      //alert('adding term');
      e = { kind:'op', tok:tok, left: e, right: e2 };
    } else if (T.is_tok('g', ')')) {
      T.advance_token();
      break;
    } else 
      break;
  } while(1);
  return e;
}




//////////// Expression Printer


function expr_tostring(e) {
  if (e.kind == 'str') {
    return "'"+e.tok+"'";
  } 
  if (e.kind == 'num') {
    return e.tok;
  } 
  if (e.kind == 'op') {
    if (e.tok == '-')
      return "(not "+expr_tostring(e.left)+")";
    else
      return "("+e.tok+" "+expr_tostring(e.left)+" "+expr_tostring(e.right)+")";
  }
  if (e.kind == 'spec') {
    return "("+e.tok+" "+expr_tostring(e.left)+")"; 
  }
  return "(unknown-"+e.kind+")";
}

function expr_tostring_infix(e) {
  if (e.kind == 'str') {
    return "'"+e.tok+"'";
  } 
  if (e.kind == 'num') {
    return e.tok;
  } 
  if (e.kind == 'op' || e.kind == 'spec') {
    var l = "";
    var r = "";
    if (e.left.kind != 'num' && e.left.kind != 'str' &&
	!(e.left.kind == e.kind && e.left.tok == e.tok)) {
      l = "(";
      r = ")";
    }
    if (e.right == undefined) {
      return e.tok+" "+l+expr_tostring_infix(e.left)+r;
    } else {
      var l2 = "";
      var r2 = "";
      if (e.right.kind != 'num' && e.right.kind != 'str' &&
	  !(e.right.kind == e.kind && e.right.tok == e.tok)) {
	l2 = "(";
	r2 = ")";
      }
      return l+expr_tostring_infix(e.left)+r+" "+e.tok+" "+l2+expr_tostring_infix(e.right)+r2;
    }
  }
  return "(unknown-"+e.kind+")";
}




////////////// Search expression transforms

// deep copy
// clone a tree.

function expr_deep_copy(e) {
  if (e.left == undefined)
    return { kind: e.kind, tok: e.tok };
  else if (e.right == undefined)
    return { kind: e.kind, tok: e.tok, left: expr_deep_copy(e.left) };
  else
    return { kind: e.kind, tok: e.tok, 
             left: expr_deep_copy(e.left),
             right: expr_deep_copy(e.right) };
}


function make_or(a,b) {
  return { kind: 'op', tok: 'or', left: a, right: b }
}
function make_and(a,b) {
  return { kind: 'op', tok: 'and', left: a, right: b }
}
function make_spec(k,a) {
  return { kind: 'spec', tok: k, left: a }
}
function make_str(s) {
  return { kind: 'str', tok: s }
}

function expr_rotate(e) {
  var t = e.left;
  e.left = e.right;
  e.right = t;
} 






// distribute (from (or a (not b))) to (or (from a) (not (from b)))
function expr_distribute_spec(e,c) {
  if (e.kind == 'spec') {
    return expr_distribute_spec(e.left, e);
  } else if (e.kind == 'str') {
    if (c != undefined)
      return { kind: 'spec', tok: c.tok, left: e };
  } else {
    if (e.left != undefined)
      e.left = expr_distribute_spec(e.left, c);
    if (e.right != undefined)
      e.right = expr_distribute_spec(e.right, c);
  }
  return e;
}

// strings without explicit specifiers need to be canonicalized to 
// be searched for in all header fields.
// convert "foo" to (or (or (f: foo) (t:foo)) (s: foo))
// also expand (all: foo) to the above plus an outer
// (or ... (body: foo))

function make_search3(s)
{
  return make_or(make_or(make_spec('from', make_str(s)),
                         make_spec('to',   make_str(s))),
                 make_spec('subject', make_str(s)));
}

function expr_add_header_search(e) {
  if (e.kind == 'str') {
    return make_search3(e.tok);
  } else if (e.kind == 'spec') {
    if (e.tok == 'all') {
      return make_or(make_search3(e.left.tok),
                     make_spec('body', make_str(e.left.tok)));
    } else
      return e;
  }

  if (e.left != undefined)
    e.left = expr_add_header_search(e.left);
  if (e.right != undefined)
    e.right = expr_add_header_search(e.right);
  return e;
}


// apply demorgan's law and negations:
// convert (not (or a b))  to  (and (not a) (not b))
// convert (not (and a b)) to  (or  (not a) (not b))
// convert (not (not a))   to  a
// recursively continue, but allow (not (from <str>))

function expr_demorgan(e) {
  if (e.kind == 'op' && e.tok == '-') {
    var under = e.left;
    if (under.kind == 'op') {
      if (under.tok == 'and' || under.tok == 'or')
        return expr_demorgan({ kind: 'op', tok: under.tok == 'and' ? 'or' : 'and', 
                               left: {kind: 'op', tok:'-', left: under.left},
                               right:{kind: 'op', tok:'-', left: under.right} });
      else if (under.tok == '-')
        return under.left;
      else
         alert('internal error in demorgan: 1');
    } else if (under.kind != 'spec') {
      alert('internal error in demorgan: 2');
    }
  } else {
    if (e.left != undefined)
      e.left = expr_demorgan(e.left);
    if (e.right != undefined)
      e.right = expr_demorgan(e.right);
  }
  return e;
}

// sort the tree so that the most costly expressions
// are the right-most expressions.  All this means is that
// we flip commutative operations (ands and ors) based
// on a relative cost metrics of the two subtrees.
// the reason for this is that this will speed up
// search times because the costliest operations will
// be performed on the smallest number of candidate
// messages.

function expr_sort(e) {
  var cleft = e.left != undefined ? expr_sort(e.left) : 0;
  var cright= e.right!= undefined ? expr_sort(e.right): 0;

  //alert('expr_sort-'+e.tok);

  if (e.kind == 'spec') {
    // body search is slow....
    if ( e.tok == 'body' || e.tok == 'filename' )
      return 10;
    return 1;
  }
  if (e.kind == 'not')
    // not will be directly above a specifier; the two
    // merge to be a specifier when we convert to an
    // search expression array.
    return cleft;

  if (e.right != undefined && cleft > cright)
    expr_rotate(e);

  return cleft+cright;
}


// distribute or into ands.  required because that's how the search
// term expression works (ors are assumed lower precedence than ands).
// (or b (and c d)) => (and (or b c) (or b d))

function expr_distribute_left(e)
{
  return make_and(make_or(e.left.left, e.right),
                  make_or(e.left.right, expr_deep_copy(e.right)));
}

function expr_distribute_down_ors(e) {
  if (e.kind == 'op' && e.tok == 'or') {
    if (e.left.kind == 'op' && e.left.tok == 'and') {
      e = expr_distribute_left(e);
    } else if (e.right.kind == 'op' && e.right.tok == 'and') {
      expr_rotate(e);
      e = expr_distribute_left(e);
    }
  }
  if (e.left != undefined)
    e.left = expr_distribute_down_ors(e.left);
  if (e.right != undefined)
    e.right = expr_distribute_down_ors(e.right);
  return e;
}

function compute_expression(s) {
  var tkz = TokenizerFactory();

  // autodetect if the outermost level is a calc specifier.
  tkz.set_string(s);
  do { tkz.advance_token() } while(!tkz.is_end());
  if (tkz.seems_like_calc && !tkz.cant_be_calc) {
    tkz.set_calc_tokenization(true);
    tkz.set_string(s);
    return { kind: 'spec', tok: 'calc', left: cparse_expr(tkz) };
  }
  tkz.set_string(s);

  var e = parse_expr(tkz, false);

  //alert(expr_tostring(e));
  e = expr_distribute_spec(e, undefined);
  //alert('expr_distribute_spec: '+expr_tostring(e));
  e = expr_add_header_search(e);
  //alert('expr_add_header_search: '+expr_tostring(e));
  e = expr_demorgan(e);
  //alert('expr_demorgan: '+expr_tostring(e));
  e = expr_distribute_down_ors(e);
  //alert('expr_distribute_down_ors: '+expr_tostring(e));
  expr_sort(e);
  //alert('expr_sort-done');
  //alert('expr_sort: '+expr_tostring(e));

  return e;
}



