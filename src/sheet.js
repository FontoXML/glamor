/*

high performance StyleSheet for css-in-js systems

- uses multiple style tags behind the scenes for millions of rules
- uses `insertRule` for appending in production for *much* faster performance
- 'polyfills' on server side


// usage

import StyleSheet from 'glamor/lib/sheet'
let styleSheet = new StyleSheet()

styleSheet.inject()
- 'injects' the stylesheet into the page (or into memory if on server)

styleSheet.insert('#box { border: 1px solid red; }')
- appends a css rule into the stylesheet

styleSheet.flush()
- empties the stylesheet of all its contents


*/

function last(arr) {
  return arr[arr.length - 1];
}

function sheetForTag(tag) {
  if (tag.sheet) {
    return tag.sheet;
  }

  // this weirdness brought to you by firefox
  for (let i = 0; i < document.styleSheets.length; i++) {
    if (document.styleSheets[i].ownerNode === tag) {
      return document.styleSheets[i];
    }
  }
}

const isBrowser = typeof window !== "undefined";
const isDev = false;
const isTest = false;

const oldIE = (() => {
  if (isBrowser) {
    let div = document.createElement("div");
    div.innerHTML = "<!--[if lt IE 10]><i></i><![endif]-->";
    return div.getElementsByTagName("i").length === 1;
  }
})();

function makeStyleTag() {
  let tag = document.createElement("style");
  tag.type = "text/css";
  tag.setAttribute("data-glamor", "");
  tag.appendChild(document.createTextNode(""));
  (document.head || document.getElementsByTagName("head")[0]).appendChild(tag);
  return tag;
}

export function StyleSheet({
  speedy = !isDev && !isTest,
  maxLength = isBrowser && oldIE ? 4000 : 65000,
} = {}) {
  this.isSpeedy = speedy; // the big drawback here is that the css won't be editable in devtools
  this.sheet = undefined;
  this.tags = [];
  this.maxLength = maxLength;
  this.ctr = 0;
}

Object.assign(StyleSheet.prototype, {
  getSheet() {
    return sheetForTag(last(this.tags));
  },
  inject() {
    if (this.injected) {
      throw new Error("already injected stylesheet!");
    }
    if (isBrowser) {
      this.tags[0] = makeStyleTag();
    } else {
      // server side 'polyfill'. just enough behavior to be useful.
      this.sheet = {
        cssRules: [],
        insertRule: (rule) => {
          // enough 'spec compliance' to be able to extract the rules later
          // in other words, just the cssText field
          this.sheet.cssRules.push({ cssText: rule });
        },
      };
    }
    this.injected = true;
  },
  speedy(bool) {
    if (this.ctr !== 0) {
      throw new Error(
        `cannot change speedy mode after inserting any rule to sheet. Either call speedy(${bool}) earlier in your app, or call flush() before speedy(${bool})`
      );
    }
    this.isSpeedy = !!bool;
  },
  _insert(rule) {
    // this weirdness for perf, and chrome's weird bug
    // https://stackoverflow.com/questions/20007992/chrome-suddenly-stopped-accepting-insertrule
    try {
      let sheet = this.getSheet();
      sheet.insertRule(
        rule,
        rule.indexOf("@import") !== -1 ? 0 : sheet.cssRules.length
      );
    } catch (e) {
      if (isDev) {
        // might need beter dx for this
        console.warn("whoops, illegal rule inserted", rule); //eslint-disable-line no-console
      }
    }
  },
  insert(rule) {
    if (isBrowser) {
      // this is the ultrafast version, works across browsers
      if (this.isSpeedy && this.getSheet().insertRule) {
        this._insert(rule);
      }
      // more browser weirdness. I don't even know
      // else if(this.tags.length > 0 && this.tags::last().styleSheet) {
      //   this.tags::last().styleSheet.cssText+= rule
      // }
      else {
        if (rule.indexOf("@import") !== -1) {
          const tag = last(this.tags);
          tag.insertBefore(document.createTextNode(rule), tag.firstChild);
        } else {
          last(this.tags).appendChild(document.createTextNode(rule));
        }
      }
    } else {
      // server side is pretty simple
      this.sheet.insertRule(
        rule,
        rule.indexOf("@import") !== -1 ? 0 : this.sheet.cssRules.length
      );
    }

    this.ctr++;
    if (isBrowser && this.ctr % this.maxLength === 0) {
      this.tags.push(makeStyleTag());
    }
    return this.ctr - 1;
  },
  // commenting this out till we decide on v3's decision
  // _replace(index, rule) {
  //   // this weirdness for perf, and chrome's weird bug
  //   // https://stackoverflow.com/questions/20007992/chrome-suddenly-stopped-accepting-insertrule
  //   try {
  //     let sheet = this.getSheet()
  //     sheet.deleteRule(index) // todo - correct index here
  //     sheet.insertRule(rule, index)
  //   }
  //   catch(e) {
  //     if(isDev) {
  //       // might need beter dx for this
  //       console.warn('whoops, problem replacing rule', rule) //eslint-disable-line no-console
  //     }
  //   }

  // }
  // replace(index, rule) {
  //   if(isBrowser) {
  //     if(this.isSpeedy && this.getSheet().insertRule) {
  //       this._replace(index, rule)
  //     }
  //     else {
  //       let _slot = Math.floor((index  + this.maxLength) / this.maxLength) - 1
  //       let _index = (index % this.maxLength) + 1
  //       let tag = this.tags[_slot]
  //       tag.replaceChild(document.createTextNode(rule), tag.childNodes[_index])
  //     }
  //   }
  //   else {
  //     let rules = this.sheet.cssRules
  //     this.sheet.cssRules = [ ...rules.slice(0, index), { cssText: rule }, ...rules.slice(index + 1) ]
  //   }
  // }
  delete(index) {
    // we insert a blank rule when 'deleting' so previously returned indexes remain stable
    return this.replace(index, "");
  },
  flush() {
    if (isBrowser) {
      this.tags.forEach((tag) => tag.parentNode.removeChild(tag));
      this.tags = [];
      this.sheet = null;
      this.ctr = 0;
      // todo - look for remnants in document.styleSheets
    } else {
      // simpler on server
      this.sheet.cssRules = [];
    }
    this.injected = false;
  },
  rules() {
    if (!isBrowser) {
      return this.sheet.cssRules;
    }
    let arr = [];
    this.tags.forEach((tag) =>
      arr.splice(arr.length, 0, ...Array.from(sheetForTag(tag).cssRules))
    );
    return arr;
  },
});
