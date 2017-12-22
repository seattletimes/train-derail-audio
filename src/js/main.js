require("component-responsive-frame/child");

var xhr = require("./lib/xhr");
var $ = require("./lib/qsa");

var players = $(".audio-player");

var parseTime = function(time) {
  var ms = time.match(/\..+$/) * 1;
  var total = 0;
  var remainder = time.replace(/\..+$/, "").split(":").reverse();
  remainder.forEach((t, i) => total += t * (i ? 60 * i : 1));
  return total + ms;
};

var parseVTT = function(text) {
  var lines = text.split("\n").map(l => l.trim());
  var record = { text: "" };
  var seeking = true;
  var buffer = [];

  for (var i = 0; i < lines.length; i++) {
    var content = lines[i];
    if (!content && !seeking) {
      buffer.push(record);
      seeking = true;
      record = { text: "" };
    }
    if (content.match(/^\d+$/)) {
      // found an index
      record.index = Number(content);
      seeking = false;
    } else if (content.match(/^\d+:\d+:/)) {
      // found a timecode
      var [start, end] = content.split(/\s+--\>\s+/);
      record.start = parseTime(start);
      record.end = parseTime(end);
      seeking = false;
    } else if (!content.match(/WEBVTT/)) {
      record.text += content.replace(/--/g, "—") + " ";
      seeking = false;
    }
  }

  if (!seeking && record.text) buffer.push(record);

  return buffer;
};

players.forEach(function(container) {

  var audio = $.one("audio", container);
  var display = $.one(".transcript-box", container);

  var transcriptURL = audio.getAttribute("data-transcript");
  var transcript = [];
  var currentItem = -1;

  xhr(transcriptURL, function(err, text) {
    if (err) return;
    if (typeof text == "string") {
      var rough = parseVTT(text);
      //re-parse into sentences

      var enders = /[.?!](\s|$)/;
      var current = { text: "", start: 0 };

      var process = function(item, i, list) {
        var ended = item.text.search(enders);
        if (ended == -1) {
          current.text += " " + item.text;
          if (i == list.length - 1) transcript.push(current);
        } else {
          current.text += " " + item.text.slice(0, ended + 1);
          current.text = current.text.trim();
          current.end = item.end;
          current.index = transcript.length;
          transcript.push(current);
          current = { text: item.text.slice(ended + 1), start: item.end };
        }
      };

      rough.forEach(process);
    } else {
      transcript = text;
    }

  });

  var MIN_KEYSTROKE = .05;

  var showLine = function(item, instant) {
    var keyTime = (item.end - item.start - .4) / item.text.length;
    if (keyTime > MIN_KEYSTROKE) keyTime = MIN_KEYSTROKE;
    if (instant) keyTime = 0;
    var html = item.text.split("").map(function(c, i) {
      var delay = (keyTime * i).toFixed(3);
      return `<span class="typed" style="animation-delay: ${delay}s">${c}</span>`;
    }).join("");
    var previous = $(".line", display);
    // var last = previous.pop();
    previous.forEach(l => display.removeChild(l));
    // if (last) {
    //   last.classList.remove("active");
    //   last.classList.add("prep", "fade");
    // }
    var speaker = item.speaker ? `<span class="speaker">${item.speaker.toUpperCase()}</span> ` : "";
    var newLine = document.createElement("div");
    newLine.className = "line active";
    newLine.innerHTML = `${speaker}${html}`;
    display.appendChild(newLine);
    display.setAttribute("data-speaker", item.speaker);
    currentItem = item.index;
  };

  var onUpdate = function(e) {
    var now = audio.currentTime;
    for (var i = 0; i < transcript.length; i++) {
      var item = transcript[i];
      if (item.start < now && item.end > now && item.index != currentItem) {
        showLine(item, audio.paused);
        break;
      }
    }
  };

  ["timeupdate", "seek"].forEach(ev => audio.addEventListener(ev, onUpdate));

  var onPause = function() {
    display.classList[audio.paused ? "add" : "remove"]("paused");
    var active = $.one(".line.active", display);
    if (active) active.classList[audio.paused ? "remove" : "add"]("active");
  };

  ["pause", "play"].forEach(ev => audio.addEventListener(ev, onPause));

});