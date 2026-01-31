function httpGet(url, callback) {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4 && xhr.status == 200) {
            callback(xhr.responseText);
        }
    }
    xhr.send(null);
}
function toLocalIsoString(date) {
    const pad = n => String(n).padStart(2, "0");
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());
    const second = pad(date.getSeconds());
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const offsetHour = pad(Math.floor(Math.abs(offset) / 60));
    const offsetMinute = pad(Math.abs(offset) % 60);

    return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${offsetHour}:${offsetMinute}`;

}
function convertUnix(unix) {
    const date = new Date(unix * 1000);
    return toLocalIsoString(date);
}

function convertTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function fetchData(data) {
    const result = {};
    result.artist = data.now_playing.song.artist;
    result.title = data.now_playing.song.title;
    result.event = data.now_playing.song.album;
    result.genre = data.now_playing.song.genre;
    result.duration = data.now_playing.duration;
    result.durationHR = convertTime(result.duration);
    result.elapsed = data.now_playing.elapsed;
    result.remaining = data.now_playing.remaining;
    result.start = data.now_playing.played_at;
    result.startUnix = convertUnix(result.start);
    result.end = result.start + result.duration;
    result.endUnix = convertUnix(result.end);
    const next = {};
    next.artist = data.playing_next.song.artist;
    next.title = data.playing_next.song.title;
    next.event = data.playing_next.song.album;
    next.genre = data.playing_next.song.genre;
    next.duration = data.playing_next.duration;
    next.durationHR = convertTime(next.duration);
    next.start = data.playing_next.played_at;
    next.startUnix = convertUnix(next.start);
    next.end = data.playing_next.played_at + data.playing_next.duration;
    next.endUnix = convertUnix(next.end);
    result.next = next;
    const queue = [];
    for (let i = 0; i < data.song_history.length; i++) {
        const entry = {};
        entry.artist = data.song_history[i].song.artist;
        entry.title = data.song_history[i].song.title;
        entry.event = data.song_history[i].song.album;
        entry.genre = data.song_history[i].song.genre;
        entry.duration = data.song_history[i].duration;
        entry.durationHR = convertTime(entry.duration);
        entry.start = data.song_history[i].played_at;
        entry.startUnix = convertUnix(entry.start);
        entry.end = entry.start + entry.duration;
        entry.endUnix = convertUnix(entry.end);
        queue.push(entry);
    }
    result.history = queue;
    return result;

}

function formatEntry(title, artist, durationHR, startUnix, endUnix) {
    return `${title} - ${artist} [${durationHR}] (from ${startUnix} to ${endUnix})`;
}

function addCell(text, parent) {
    let cell = document.createElement("td");
    cell.innerText = text;
    parent.appendChild(cell);
    return
}

function addCellWithLink(text, link, parent) {
    let cell = document.createElement("td");
    let cellLink = document.createElement("a");
    cellLink.href = link;
    cellLink.innerText = text;
    cell.appendChild(cellLink);
    parent.appendChild(cell);
    return
}

function createEntry(index, entryData) {
    let entry = document.createElement("tr");

    addCell(index.toString(), entry);
    addCell(entryData.title, entry);
    const artistLink = entryData.artist.toLowerCase().replaceAll(" ", "-");
    addCellWithLink(entryData.artist, `https://c3sets.de/artists/${artistLink}`, entry);
    addCell(entryData.event, entry);
    addCell(entryData.genre, entry);
    addCell(entryData.durationHR, entry);
    addCell(entryData.startUnix, entry);
    addCell(entryData.endUnix, entry);

    return entry;
}
function displayData(data) {
    let list = document.getElementById("playlist-body");
    while (list.firstChild) {
        list.removeChild(list.firstChild);
    }
    let entry = createEntry(-1, data.next);
    entry.className = "next";
    list.appendChild(entry);
    entry = createEntry(0, data);
    entry.className = "now";
    list.appendChild(entry);
    for (let i = 0; i < data.history.length; i++) {
        entry = createEntry((i + 1), data.history[i]);
        entry.className = "history";
        list.appendChild(entry);
    }
    entry = document.createElement("li");
    entry.innerHTML = formatEntry(data.artist)
}

let nextTimer = null;
let resyncTimer = null;
let stopped = false;
async function updateTrackPosition(duration, initialElapsed) {
    if (stopped) return;
    const progress = document.getElementById("progress");
    const position = document.getElementById("positiondata");
    let elapsed = initialElapsed;
    while (elapsed <= duration && !stopped) {
        progress.min = 0;
        progress.max = duration;
        progress.value = elapsed;
        elapsed += 1;
        position.innerHTML = convertTime(elapsed) + " / " + convertTime(duration);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

}
async function resyncProgress() {
    if (stopped) return;
    try {
        const response = await fetch("https://live.c3lounge.de/api/nowplaying/c3lounge_radio");
        stopped = true;
        await new Promise(resolve => setTimeout(resolve, 1000));
        stopped = false;
        const data = await response.json();
        const parsed = fetchData(data);
        resyncTimer = setTimeout(resyncProgress, 60000*15);
        updateTrackPosition(parsed.duration, parsed.elapsed).then(r => {});
    } catch (err) {
        console.error("Resync error:", err);
        resyncTimer = setTimeout(resyncProgress, 60000);

    }
}
async function requestAPI() {
    if (stopped) return;
    try {
        const response = await fetch("https://live.c3lounge.de/api/nowplaying/c3lounge_radio");
        const data = await response.json();
        const parsed = fetchData(data);
        displayData(parsed);
        const delay = parsed.remaining;
        nextTimer = setTimeout(requestAPI, (delay + 30) * 1000);
        updateTrackPosition(parsed.duration, parsed.elapsed).then(r => {});
        resyncTimer = setTimeout(resyncProgress, 60000*15);
    } catch (err) {
        console.error("API error:", err);
        nextTimer = setTimeout(requestAPI, 300000);
    }
}
async function playpauseaction () {

}
let playpause = document.getElementById("playpause");
playpause.addEventListener("click", function() {
    const audio = document.getElementById("audio");
    if (audio.paused) {
        stopped = false;
        requestAPI().then(r => {});
        audio.src = "";
        audio.load();
        audio.src = "https://live.c3lounge.de/listen/c3lounge_radio/192.mp3";
        audio.load();
        audio.play();


        playpause.innerHTML = "Pause";
    } else {
        stopped = true;
        audio.pause();
        clearTimeout(nextTimer);
        clearTimeout(resyncTimer);
        playpause.innerHTML = "Play";
    }
})
const audio = document.getElementById("audio");
const volumeslider = document.getElementById("volume");
const minGain = 0.001;
const maxGain = 1;

volumeslider.addEventListener("input", function() {
    const linearValue = parseFloat(this.value);
    if (linearValue <= 0) {
        audio.volume = 0;
        return;
    }
    const gain = minGain * Math.pow(maxGain / minGain, linearValue);
    audio.volume = Math.min(1, Math.max(0, gain));
    localStorage.setItem("volume", audio.volume)
    localStorage.setItem("volumeSlider", linearValue);
})

const volume = localStorage.getItem("volume");
if (volume !== null) {
    audio.volume = parseFloat(volume);
}
const volumeSliderValue = localStorage.getItem("volumeSlider");
if (volumeSliderValue !== null) {
    volumeslider.value = volumeSliderValue;
}

async function audiorestart() {
    await new Promise(resolve => setTimeout(resolve, 1000));
    audio.pause();
    audio.src = "";
    audio.load();
    audio.src = "https://live.c3lounge.de/listen/c3lounge_radio/192.mp3";
    audio.load()
    audio.play();
    stopped = false;
    //requestAPI().then(r => {});
}

audio.addEventListener("error", function() {
    console.error("Audio playback error:", audio.error);
    audiorestart().then(r => {});
})

audio.addEventListener("stalled", function() {
    console.warn("Audio playback stalled, restarting...");
    audiorestart().then(r => {});
})