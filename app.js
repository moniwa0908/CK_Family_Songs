import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  updateDoc,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { firebaseConfig, familyViewerEmail } from './firebase-config.js';
import { initialSongs } from './song-seed.js';
import { songCleanupData } from './song-cleanup.js';
import { initialLives } from './live-seed.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
})[char]);
const formatDate = value => value
  ? new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
      .format(new Date(`${value}T00:00:00`))
  : '';

const timestampToDate = value => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};


const getJstDateKey = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const formatAddedDate = value => {
  const date = timestampToDate(value);
  return date ? new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(date) : '';
};

const configured = !Object.values(firebaseConfig).some(value => String(value).includes('YOUR_'))
  && !String(familyViewerEmail).includes('YOUR_');


const songReadingMap = {
  'TO BE': 'とぅーびー',
  'YARE YARE': 'やれやれ',
  'C&K XV': 'しーあんどけーふぃふてぃーん',
  'DAN': 'だん',
  'believe': 'びりーぶ',
  'C&K XIV': 'しーあんどけーふぉーてぃーん',
  'GENTEN': 'げんてん',
  'I.M.A': 'いま',
  'HELLO SAY GOODBYE': 'はろーせいぐっばい',
  'Brand New Days': 'ぶらんどにゅーでいず',
  'C&K XIII': 'しーあんどけーさーてぃーん',
  'KARADANONAKADAKARADA': 'からだのなかだからだ',
  'ONE DAY': 'わんでい',
  'Alma': 'あるま',
  'traveling carnival〜移動式遊園地のテーマ〜': 'とらべりんぐかーにばるいどうしきゆうえんちのてーま',
  'C&K XI': 'しーあんどけーいれぶん',
  'Drive!!!': 'どらいぶ',
  'TANSAN FLAVOR': 'たんさんふれーばー',
  'Home': 'ほーむ',
  'MAMANIE': 'ままにえ',
  'Y': 'わい',
  'APAP': 'えーぴーえーぴー',
  'Sun Son Sound feat.九州男': 'さんさんさうんどふぃーちゃりんぐくすお',
  'MATSURI': 'まつり',
  'to di Bone': 'とぅでぃぼーん',
  'milky way': 'みるきーうぇい',
  'HOTEL NETTAI-YA': 'ほてるねったいや',
  'JOY A LIFE': 'じょいあらいふ',
  'DANCE☆MAN(WOKKY WOKKY×BOGGIE WOGGIE)': 'だんすまんうぉっきーうぉっきーぶぎーうぎー',
  'EVERYBODY': 'えぶりばでぃ',
  'AND MORE...': 'あんどもあ',
  'JIMOTO with カサリンチュ': 'じもとうぃずかさりんちゅ',
  'BYE BYE BOO': 'ばいばいぶー',
  'GET@LADY': 'げっとあれでぃ',
  'C&KΦ': 'しーあんどけーふぁい',
  'C&K XII': 'しーあんどけーとぅえるぶ'
};

const kanaCollator = new Intl.Collator('ja', { sensitivity: 'base', numeric: true });

function normalizeReading(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('ja')
    .replace(/[\s・･!！?？'"“”‘’.,，。☆★@＆&()（）\-ー〜~]/g, '');
}

function getSongReading(song) {
  const reading = String(song.reading || songReadingMap[song.title] || song.title || '').trim();
  return normalizeReading(reading);
}

function compareSongsByKana(a, b) {
  const readingResult = kanaCollator.compare(getSongReading(a), getSongReading(b));
  if (readingResult !== 0) return readingResult;
  return kanaCollator.compare(String(a.title || ''), String(b.title || ''));
}

const favorites = new Set(JSON.parse(localStorage.getItem('ck-favorites') || '[]'));
let lyricsFontSize = Number(localStorage.getItem('ck-lyrics-font-size') || 14);
let auth;
let db;
let role = 'viewer';
const viewerToolOrigins = new Map();
['.song-toolbar', '.live-toolbar'].forEach(selector => {
  const element = document.querySelector(selector);
  if (element) viewerToolOrigins.set(element, { parent: element.parentNode, next: element.nextSibling });
});

function restoreViewerTools() {
  viewerToolOrigins.forEach((origin, element) => {
    if (origin.next && origin.next.parentNode === origin.parent) origin.parent.insertBefore(element, origin.next);
    else origin.parent.appendChild(element);
  });
}

function updateViewerTools() {
  const host = $('viewerToolsHost');
  if (!host) return;
  if (role !== 'viewer') {
    restoreViewerTools();
    host.classList.add('hidden');
    host.replaceChildren();
    return;
  }
  const activeTab = document.querySelector('.tab-page.active')?.id;
  const toolbar = activeTab === 'songsTab'
    ? document.querySelector('.song-toolbar')
    : activeTab === 'livesTab'
      ? document.querySelector('.live-toolbar')
      : null;
  host.replaceChildren();
  if (toolbar) {
    host.appendChild(toolbar);
    host.classList.remove('hidden');
  } else {
    host.classList.add('hidden');
  }
}

let songs = [];
let lives = [];
let currentSong = null;
let currentLive = null;
let loading = false;

function showError(element, message) {
  element.textContent = message;
  element.classList.toggle('hidden', !message);
}

if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  await setPersistence(auth, browserLocalPersistence);
} else {
  showError($('loginError'), 'Firebase設定が未入力です。付属の「設定手順.txt」を確認してください。');
}

$('familyLoginForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!configured) return;
  showError($('loginError'), '');
  const button = event.submitter;
  button.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, familyViewerEmail, $('familyPassphrase').value);
    $('familyPassphrase').value = '';
  } catch (error) {
    console.error(error);
    showError($('loginError'), '合言葉が違います。大文字・小文字も含めて確認してください。');
  } finally {
    button.disabled = false;
  }
});

function openAdminLogin() {
  $('adminLoginForm').reset();
  showError($('adminLoginError'), '');
  $('adminLoginDialog').showModal();
}

$('showAdminLoginBtn').addEventListener('click', openAdminLogin);

// 家族画面をすっきり保つため、アプリ名の長押しで管理者ログインを開きます。
let adminPressTimer = null;
const appTitleAccess = $('appTitleAccess');
const startAdminPress = () => {
  if (role === 'admin') return;
  clearTimeout(adminPressTimer);
  adminPressTimer = setTimeout(openAdminLogin, 700);
};
const cancelAdminPress = () => {
  clearTimeout(adminPressTimer);
  adminPressTimer = null;
};
appTitleAccess.addEventListener('touchstart', startAdminPress, { passive: true });
appTitleAccess.addEventListener('touchend', cancelAdminPress);
appTitleAccess.addEventListener('touchcancel', cancelAdminPress);
appTitleAccess.addEventListener('mousedown', startAdminPress);
appTitleAccess.addEventListener('mouseup', cancelAdminPress);
appTitleAccess.addEventListener('mouseleave', cancelAdminPress);
appTitleAccess.addEventListener('dblclick', () => {
  if (role !== 'admin') openAdminLogin();
});
$('adminLoginForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!configured) return;
  showError($('adminLoginError'), '');
  const button = event.submitter;
  button.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, $('adminEmail').value.trim(), $('adminPassword').value);
    $('adminLoginDialog').close();
  } catch (error) {
    console.error(error);
    showError($('adminLoginError'), '管理者ログインに失敗しました。メールアドレスとパスワードを確認してください。');
  } finally {
    button.disabled = false;
  }
});

$('logoutBtn').addEventListener('click', async () => {
  await signOut(auth);
  $('familyPassphrase').value = '';
});

if (configured) {
  onAuthStateChanged(auth, async user => {
    if (!user) {
      role = 'viewer';
      $('loginView').classList.remove('hidden');
      $('mainView').classList.add('hidden');
      return;
    }

    try {
      const roleSnapshot = await getDoc(doc(db, 'users', user.uid));
      if (!roleSnapshot.exists()) throw new Error('role document not found');
      role = roleSnapshot.data().role;
      if (!['admin', 'viewer'].includes(role)) throw new Error('invalid role');

      $('roleBadge').textContent = role === 'admin' ? '管理者モード' : '';
      $('roleBadge').classList.toggle('hidden', role !== 'admin');
      document.querySelectorAll('.admin-only').forEach(element => {
        element.classList.toggle('hidden', role !== 'admin');
      });
      $('logoutBtn').classList.toggle('hidden', role !== 'admin');
      updateViewerTools();
      $('loginView').classList.add('hidden');
      $('mainView').classList.remove('hidden');
      await reloadAll();
    } catch (error) {
      console.error(error);
      await signOut(auth);
      showError($('loginError'), '利用権限が登録されていません。Firestoreのusers設定を確認してください。');
    }
  });
}

async function reloadAll() {
  if (loading) return;
  loading = true;
  try {
    // 空のコレクションでも確実に読み込めるよう、並べ替えは取得後にアプリ側で行います。
    const [songSnapshot, liveSnapshot] = await Promise.all([
      getDocs(collection(db, 'songs')),
      getDocs(collection(db, 'lives'))
    ]);

    songs = songSnapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => {
        const aTime = a.createdAt?.seconds ?? 0;
        const bTime = b.createdAt?.seconds ?? 0;
        return bTime - aTime;
      });

    lives = liveSnapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

    renderAll();
    showError($('dataError'), '');
  } catch (error) {
    console.error('Firestore load error:', error);
    const code = error?.code ? `（${error.code}）` : '';
    showError($('dataError'), `データを読み込めませんでした${code}。一度ロックして、合言葉で入り直してください。`);
  } finally {
    loading = false;
  }
}

function songCard(song) {
  const metadata = [song.album || 'アルバム未設定', song.releaseDate ? formatDate(song.releaseDate) : '']
    .filter(Boolean).join(' ・ ');
  return `<article class="item-card">
    <div class="item-top">
      <button class="card-open" data-song="${song.id}">
        <h3>${esc(song.title)}</h3>
        <div class="item-meta">${esc(metadata)}</div>
      </button>
      <button class="heart" data-fav="${song.id}" aria-label="お気に入り">${favorites.has(song.id) ? '♥' : '♡'}</button>
    </div>
  </article>`;
}

function bindSongCards(root) {
  root.querySelectorAll('[data-song]').forEach(button => {
    button.addEventListener('click', () => openSong(button.dataset.song));
  });
  root.querySelectorAll('[data-fav]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      toggleFavorite(button.dataset.fav);
    });
  });
}

function refreshAlbumFilter() {
  const select = $('albumFilter');
  if (!select) return;
  const current = select.value;
  const albums = [...new Set(songs.map(song => String(song.album || '').trim()).filter(Boolean))]
    .sort((a, b) => kanaCollator.compare(a, b));
  select.innerHTML = '<option value="all">全アルバム</option>'
    + '<option value="__unset__">アルバム未設定</option>'
    + albums.map(album => `<option value="${esc(album)}">${esc(album)}</option>`).join('');
  if ([...select.options].some(option => option.value === current)) select.value = current;
}

function renderSongs() {
  let result = [...songs];
  const term = $('songSearch').value.trim().toLocaleLowerCase('ja');
  if (term) {
    result = result.filter(song => [song.title, song.album, song.lyrics, song.memo]
      .some(value => String(value || '').toLocaleLowerCase('ja').includes(term))
      || getSongReading(song).includes(normalizeReading(term)));
  }

  const album = $('albumFilter')?.value || 'all';
  if (album === '__unset__') result = result.filter(song => !String(song.album || '').trim());
  else if (album !== 'all') result = result.filter(song => String(song.album || '').trim() === album);

  // 曲一覧は選択欄を置かず、常に読み仮名のあいうえお順で表示します。
  result.sort(compareSongsByKana);
  $('songResultCount').textContent = `${result.length}曲を表示／全${songs.length}曲`;
  $('songList').innerHTML = result.length
    ? result.map(songCard).join('')
    : '<div class="item-card muted">該当する曲はありません。</div>';
  bindSongCards($('songList'));
}

function renderFavorites() {
  const result = songs.filter(song => favorites.has(song.id));
  $('favoriteList').innerHTML = result.length
    ? result.map(songCard).join('')
    : '<div class="item-card muted">お気に入りはまだありません。</div>';
  bindSongCards($('favoriteList'));
}

function renderLives() {
  const today = getJstDateKey();
  const ordered = [...lives].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const filter = $('liveFilter')?.value || 'all';
  const shown = ordered.filter(live => {
    if (filter === 'all') return true;
    if (filter === 'attending') return Boolean(live.attending) && live.date >= today;
    return filter === 'upcoming' ? live.date >= today : live.date < today;
  });
  const nextAttending = ordered.find(live => live.attending && live.date >= today);
  $('liveList').innerHTML = shown.length
    ? shown.map(live => {
        const attending = Boolean(live.attending) && live.date >= today;
        const isNextAttending = Boolean(nextAttending && live.id === nextAttending.id);
        return `<article class="item-card live-card ${attending ? 'attending-live' : ''} ${isNextAttending ? 'next-attending-live' : ''}"><button class="card-open" data-live="${live.id}">
        <div class="live-badges"><span class="date-chip">${live.date >= today ? '今後' : '過去'}</span>${isNextAttending ? '<span class="next-attending-chip">★ 次に行くライブ</span>' : attending ? '<span class="attending-chip">★ 参加予定</span>' : ''}</div>
        <h3>${esc(live.title)}</h3>
        <div class="item-meta">${esc(formatDate(live.date))}${live.time ? ` ${esc(live.time)}` : ''} ・ ${esc(live.venue || '会場未設定')}</div>
      </button></article>`;
      }).join('')
    : '<div class="item-card muted">該当するライブはありません。</div>';
  $('liveList').querySelectorAll('[data-live]').forEach(button => {
    button.addEventListener('click', () => openLive(button.dataset.live));
  });
  const nextOverall = ordered.find(live => live.date >= today);

  // NEXT LIVE は参加予定に関係なく、C&Kの直近公演を表示
  $('nextLiveTitle').textContent = nextOverall ? nextOverall.title : '今後のライブ予定はありません';
  $('nextLiveMeta').textContent = nextOverall ? `${formatDate(nextOverall.date)} ${nextOverall.time || ''} ${nextOverall.venue || ''}`.trim() : '';

  // その下には、自分が「参加予定」にした次の公演を別枠で表示
  if ($('nextAttendingLiveTitle')) {
    $('nextAttendingLiveTitle').textContent = nextAttending ? nextAttending.title : '参加予定のライブはありません';
    $('nextAttendingLiveMeta').textContent = nextAttending ? `${formatDate(nextAttending.date)} ${nextAttending.time || ''} ${nextAttending.venue || ''}`.trim() : '';
  }

  // ホームのライブカードから、その公演の詳細画面を直接開く
  const overallCard = $('nextOverallLiveCard');
  if (overallCard) {
    overallCard.classList.toggle('is-disabled', !nextOverall);
    overallCard.onclick = nextOverall ? () => openLive(nextOverall.id) : null;
    overallCard.onkeydown = nextOverall ? (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openLive(nextOverall.id);
      }
    } : null;
  }

  const attendingCard = $('nextAttendingLiveCard');
  if (attendingCard) {
    attendingCard.classList.toggle('is-disabled', !nextAttending);
    attendingCard.onclick = nextAttending ? () => openLive(nextAttending.id) : null;
    attendingCard.onkeydown = nextAttending ? (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openLive(nextAttending.id);
      }
    } : null;
  }
}

function renderHome() {
  $('songCount').textContent = songs.length;
  $('liveCount').textContent = lives.length;
  $('favoriteCount').textContent = favorites.size;
}
function renderAll() {
  refreshAlbumFilter();
  renderSongs();
  renderLives();
  renderFavorites();
  renderHome();
}

function toggleFavorite(id) {
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  localStorage.setItem('ck-favorites', JSON.stringify([...favorites]));
  renderAll();
}

function openSong(id) {
  currentSong = songs.find(song => song.id === id);
  if (!currentSong) return;
  $('viewSongTitle').textContent = currentSong.title;
  $('viewSongMeta').textContent = [currentSong.album, currentSong.releaseDate ? formatDate(currentSong.releaseDate) : '']
    .filter(Boolean).join(' ・ ');
  $('viewSongLyrics').textContent = currentSong.lyrics || '歌詞はまだ登録されていません。';
  $('viewSongLyrics').style.fontSize = `${lyricsFontSize}px`;
  $('viewSongMemo').textContent = currentSong.memo || '';
  $('youtubeBtn').classList.toggle('hidden', !currentSong.link);
  $('youtubeBtn').textContent = '▶ 動画をここで再生';
  closeEmbeddedYoutube();
  $('favoriteBtn').textContent = favorites.has(id) ? '♥ お気に入り済み' : '♡ お気に入り';
  $('songViewDialog').showModal();
}

$('favoriteBtn').addEventListener('click', () => {
  if (!currentSong) return;
  toggleFavorite(currentSong.id);
  $('favoriteBtn').textContent = favorites.has(currentSong.id) ? '♥ お気に入り済み' : '♡ お気に入り';
});


let randomPlayActive=false;
let randomCurrentSongId='';
let randomQueue=[];
let randomSyncTimer=null;
let randomLastVideoId='';

function randomPlayableSongs(){return songs.filter(song=>getYoutubeVideoId(song.link));}
function shuffleSongs(items){
  const arr=[...items];
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}
function buildYouTubePlaylistEmbed(){
  const playable=shuffleSongs(randomPlayableSongs());
  if(!playable.length){
    $('randomNowPlaying').textContent='YouTube動画が登録されている曲がありません。';
    return false;
  }
  randomQueue=playable;
  const ids=playable.map(song=>getYoutubeVideoId(song.link)).filter(Boolean);
  const first=playable[0], firstId=ids[0], rest=ids.slice(1);
  randomCurrentSongId=first.id;
  $('randomNowPlaying').textContent=`ランダム連続再生：${playable.length}曲`;
  $('randomLyricsTitle').textContent=first.title;
  $('randomLyrics').textContent=first.lyrics || '歌詞はまだ登録されていません。';
  $('randomPlayerWrap').classList.remove('hidden');
  $('randomPlayToggleBtn').textContent='■ 停止';

  const oldFrame=$('randomYoutubePlayer');
  const frame=document.createElement('iframe');
  frame.id='randomYoutubePlayer';
  frame.title='YouTubeランダム連続再生';
  frame.allow='autoplay; encrypted-media; picture-in-picture';
  frame.allowFullscreen=true;
  const playlist=rest.length?`&playlist=${encodeURIComponent(rest.join(','))}`:'';
  frame.src=`https://www.youtube.com/embed/${encodeURIComponent(firstId)}?playsinline=1&rel=0&autoplay=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}${playlist}`;
  oldFrame.replaceWith(frame);
  randomLastVideoId='';
  startRandomLyricsSync();
  return true;
}

function syncLyricsToVideoId(videoId){
  if(!videoId) return;

  const normalizedId=String(videoId).trim();
  if(!normalizedId || normalizedId===randomLastVideoId) return;

  const song=songs.find(item=>getYoutubeVideoId(item.link)===normalizedId);
  if(!song) return;

  randomLastVideoId=normalizedId;
  randomCurrentSongId=song.id;
  $('randomNowPlaying').textContent=`再生中：${song.title}`;
  $('randomLyricsTitle').textContent=song.title;
  $('randomLyrics').textContent=song.lyrics || '歌詞はまだ登録されていません。';
}

function currentRandomFrame(){
  return $('randomYoutubePlayer');
}

function requestRandomVideoData(){
  const frame=currentRandomFrame();
  if(!frame?.contentWindow || !randomPlayActive) return;

  try{
    // 現在のiframeだけに問い合わせる。
    frame.contentWindow.postMessage(JSON.stringify({
      event:'listening',
      id:'ck-random-player'
    }),'https://www.youtube.com');

    frame.contentWindow.postMessage(JSON.stringify({
      event:'command',
      func:'getVideoData',
      args:[]
    }),'https://www.youtube.com');
  }catch(_){}
}

function startRandomLyricsSync(){
  stopRandomLyricsSync();
  randomSyncTimer=setInterval(requestRandomVideoData,700);
  setTimeout(requestRandomVideoData,250);
}

function stopRandomLyricsSync(){
  if(randomSyncTimer) clearInterval(randomSyncTimer);
  randomSyncTimer=null;
}

window.addEventListener('message',event=>{
  if(!randomPlayActive) return;

  const frame=currentRandomFrame();

  // 重要: 現在表示中のYouTube iframe本人からの通知だけ採用する。
  if(!frame?.contentWindow || event.source!==frame.contentWindow) return;

  const origin=String(event.origin||'');
  if(
    origin!=='https://www.youtube.com' &&
    origin!=='https://www.youtube-nocookie.com'
  ) return;

  let data=event.data;
  if(typeof data==='string'){
    try{data=JSON.parse(data)}catch(_){return}
  }
  if(!data) return;

  let videoId='';

  // YouTube iframeが送るinfoDeliveryのvideoDataを最優先。
  if(data.event==='infoDelivery' && data.info?.videoData?.video_id){
    videoId=data.info.videoData.video_id;
  }else if(data.info?.videoData?.video_id){
    videoId=data.info.videoData.video_id;
  }else if(data.info?.video_id){
    videoId=data.info.video_id;
  }

  if(videoId) syncLyricsToVideoId(videoId);
});

$('randomPlayToggleBtn')?.addEventListener('click',()=>{
  if(randomPlayActive){
    randomPlayActive=false;
    stopRandomLyricsSync();
    const frame=$('randomYoutubePlayer'); if(frame) frame.src='about:blank';
    $('randomPlayerWrap').classList.add('hidden');
    $('randomPlayToggleBtn').textContent='▶ 連続再生';
    $('randomNowPlaying').textContent='停止しました。';
    return;
  }
  randomPlayActive=true;
  if(!buildYouTubePlaylistEmbed()){
    randomPlayActive=false;
    $('randomPlayToggleBtn').textContent='▶ 連続再生';
  }
});
$('randomNextBtn')?.addEventListener('click',()=>{
  randomPlayActive=true;
  buildYouTubePlaylistEmbed();
});
$('randomStopBtn')?.addEventListener('click',()=>{
  randomPlayActive=false; stopRandomLyricsSync(); randomQueue=[]; randomCurrentSongId=''; randomLastVideoId='';
  const frame=$('randomYoutubePlayer'); if(frame) frame.src='about:blank';
  $('randomPlayerWrap').classList.add('hidden');
  $('randomPlayToggleBtn').textContent='▶ 連続再生';
  $('randomNowPlaying').textContent='動画登録済みの曲からランダムで連続再生します。';
  $('randomLyricsTitle').textContent=''; $('randomLyrics').textContent='';
});

function getYoutubeVideoId(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (host.endsWith('youtube.com')) {
      if (parsed.pathname === '/watch') return parsed.searchParams.get('v') || '';
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (['embed', 'shorts', 'live'].includes(parts[0])) return parts[1] || '';
    }
  } catch (_) {}
  const match = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,})/);
  return match?.[1] || '';
}

function closeEmbeddedYoutube() {
  const wrap = $('youtubePlayerWrap');
  const frame = $('youtubePlayer');
  if (frame) frame.removeAttribute('src');
  if (wrap) wrap.classList.add('hidden');
}

$('youtubeBtn').addEventListener('click', () => {
  if (!currentSong?.link) return;
  const videoId = getYoutubeVideoId(currentSong.link);
  $('openYoutubeExternally').href = currentSong.link;
  if (!videoId) {
    window.open(currentSong.link, '_blank', 'noopener');
    return;
  }
  $('youtubePlayer').src = `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&rel=0`;
  $('youtubePlayerWrap').classList.remove('hidden');
  $('youtubeBtn').textContent = '▶ 動画を再読み込み';
  $('youtubePlayerWrap').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

$('closeYoutubePlayerBtn').addEventListener('click', () => {
  closeEmbeddedYoutube();
  $('youtubeBtn').textContent = '▶ 動画をここで再生';
});



$('songViewDialog').addEventListener('close', closeEmbeddedYoutube);

$('editSongBtn').addEventListener('click', () => {
  if (!currentSong) return;
  $('songViewDialog').close();
  openSongForm(currentSong);
});
$('addSongBtn').addEventListener('click', () => openSongForm());

function openSongForm(song = null) {
  $('songForm').reset();
  $('songId').value = song?.id || '';
  $('songTitle').value = song?.title || '';
  $('songReading').value = song?.reading || songReadingMap[song?.title] || '';
  $('songAlbum').value = song?.album || '';
  $('songRelease').value = song?.releaseDate || '';
  $('songLyrics').value = song?.lyrics || '';
  $('songMemo').value = song?.memo || '';
  $('songLink').value = song?.link || '';
  $('songDialogTitle').textContent = song ? '曲を編集' : '曲を追加';
  $('deleteSongBtn').classList.toggle('hidden', !song);
  $('songDialog').showModal();
}

$('songForm').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('songId').value;
  const data = {
    title: $('songTitle').value.trim(),
    reading: $('songReading').value.trim(),
    album: $('songAlbum').value.trim(),
    releaseDate: $('songRelease').value,
    lyrics: $('songLyrics').value,
    memo: $('songMemo').value.trim(),
    link: $('songLink').value.trim(),
    updatedAt: serverTimestamp()
  };
  try {
    if (id) await updateDoc(doc(db, 'songs', id), data);
    else await addDoc(collection(db, 'songs'), { ...data, createdAt: serverTimestamp() });
    $('songDialog').close();
    await reloadAll();
  } catch (error) {
    console.error(error);
    alert('保存できませんでした。管理者モードか確認してください。');
  }
});

$('deleteSongBtn').addEventListener('click', async () => {
  const id = $('songId').value;
  if (!id || !confirm('この曲を削除しますか？')) return;
  await deleteDoc(doc(db, 'songs', id));
  favorites.delete(id);
  localStorage.setItem('ck-favorites', JSON.stringify([...favorites]));
  $('songDialog').close();
  await reloadAll();
});

$('addLiveBtn').addEventListener('click', () => openLiveForm());

function openLive(id) {
  currentLive = lives.find(live => live.id === id);
  if (!currentLive) return;
  $('viewLiveTitle').textContent = `${currentLive.attending ? '★ ' : ''}${currentLive.title}`;
  $('viewLiveMeta').textContent = `${formatDate(currentLive.date)} ${currentLive.time || ''} ・ ${currentLive.venue || ''}${currentLive.seat ? ` ・ ${currentLive.seat}` : ''}`;

  const mapButton = $('viewLiveMapBtn');
  if (mapButton) {
    const venue = String(currentLive.venue || '').trim();
    if (venue) {
      mapButton.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
      mapButton.classList.remove('hidden');
      mapButton.setAttribute('aria-label', `${venue}をGoogleマップで見る`);
    } else {
      mapButton.href = '#';
      mapButton.classList.add('hidden');
    }
  }

  renderSetlist(currentLive.setlist || '');
  $('viewLiveMemo').textContent = currentLive.memo || '';
  $('liveViewDialog').showModal();
}

$('editLiveBtn').addEventListener('click', () => {
  if (!currentLive) return;
  $('liveViewDialog').close();
  openLiveForm(currentLive);
});

function openLiveForm(live = null) {
  $('liveForm').reset();
  $('liveId').value = live?.id || '';
  $('liveTitle').value = live?.title || '';
  $('liveDate').value = live?.date || '';
  $('liveTime').value = live?.time || '';
  $('liveVenue').value = live?.venue || '';
  $('liveSeat').value = live?.seat || '';
  $('liveAttending').checked = Boolean(live?.attending);
  $('liveSetlist').value = live?.setlist || '';
  $('liveMemo').value = live?.memo || '';
  $('liveDialogTitle').textContent = live ? 'ライブを編集' : 'ライブを追加';
  $('deleteLiveBtn').classList.toggle('hidden', !live);
  $('liveDialog').showModal();
}

$('liveForm').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('liveId').value;
  const data = {
    title: $('liveTitle').value.trim(),
    date: $('liveDate').value,
    time: $('liveTime').value,
    venue: $('liveVenue').value.trim(),
    seat: $('liveSeat').value.trim(),
    attending: $('liveAttending').checked,
    setlist: $('liveSetlist').value,
    memo: $('liveMemo').value.trim(),
    updatedAt: serverTimestamp()
  };
  try {
    if (id) await updateDoc(doc(db, 'lives', id), data);
    else await addDoc(collection(db, 'lives'), { ...data, createdAt: serverTimestamp() });
    $('liveDialog').close();
    await reloadAll();
  } catch (error) {
    console.error(error);
    alert('保存できませんでした。管理者モードか確認してください。');
  }
});

$('deleteLiveBtn').addEventListener('click', async () => {
  const id = $('liveId').value;
  if (!id || !confirm('このライブを削除しますか？')) return;
  await deleteDoc(doc(db, 'lives', id));
  $('liveDialog').close();
  await reloadAll();
});

document.querySelectorAll('.close-dialog').forEach(button => {
  button.addEventListener('click', () => button.closest('dialog').close());
});

function scrollNearestLiveToCenter() {
  const today = getJstDateKey();
  const ordered = [...lives]
    .filter(live => live?.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (!ordered.length) {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    return;
  }

  // 今日以降で最初の公演を優先。なければ一番新しい過去公演。
  const nearest = ordered.find(live => live.date >= today) || ordered[ordered.length - 1];

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const buttons = [...document.querySelectorAll('#liveList [data-live]')];
      const target = buttons.find(button => button.dataset.live === nearest.id);

      if (target) {
        target.scrollIntoView({
          behavior: 'auto',
          block: 'center',
          inline: 'nearest'
        });
      } else {
        // 絞り込み等で対象が表示されていない場合はライブ一覧の先頭へ。
        document.getElementById('liveList')?.scrollIntoView({
          behavior: 'auto',
          block: 'start'
        });
      }
    });
  });
}

document.querySelectorAll('.bottom-nav button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.bottom-nav button').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.tab-page').forEach(page => page.classList.remove('active'));
    button.classList.add('active');
    $(button.dataset.tab).classList.add('active');
    updateViewerTools();
    if (button.dataset.tab === 'livesTab') {
      // ライブ画面は、今日に一番近い公演が画面中央に来る位置へ移動。
      scrollNearestLiveToCenter();
    } else {
      // その他のタブはこれまでどおり上部から表示。
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  });
});

$('homeSongsLink')?.addEventListener('click', () => {
  document.querySelector('.bottom-nav button[data-tab="songsTab"]')?.click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('homeLivesLink')?.addEventListener('click', () => {
  document.querySelector('.bottom-nav button[data-tab="livesTab"]')?.click();
});




async function importInitialSongs() {
  if (role !== 'admin') return;
  const existingTitles = new Set(songs.map(song => String(song.title || '').trim().toLocaleLowerCase('ja')));
  const missing = initialSongs.filter(song => !existingTitles.has(song.title.trim().toLocaleLowerCase('ja')));
  if (!missing.length) {
    alert('初期曲名はすべて登録済みです。');
    return;
  }
  if (!confirm(`${missing.length}曲を一括登録します。歌詞欄は空欄です。よろしいですか？`)) return;
  const button = $('seedSongsBtn');
  button.disabled = true;
  button.textContent = '登録中…';
  try {
    const batch = writeBatch(db);
    missing.forEach(song => {
      const ref = doc(collection(db, 'songs'));
      batch.set(ref, {
        title: song.title,
        reading: song.reading || songReadingMap[song.title] || '',
        album: song.album || '',
        releaseDate: song.releaseDate || '',
        lyrics: '',
        memo: '初期曲名リストから登録',
        link: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });
    await batch.commit();
    await reloadAll();
    alert(`${missing.length}曲を登録しました。`);
  } catch (error) {
    console.error(error);
    alert('一括登録に失敗しました。もう一度お試しください。');
  } finally {
    button.disabled = false;
    button.textContent = '初期曲名を一括登録';
  }
}

$('seedSongsBtn')?.addEventListener('click', importInitialSongs);

async function cleanupSongData() {
  if (role !== 'admin') return;
  if (!confirm('登録済み曲の表記とふりがなを整理します。歌詞・動画URL・メモは消えません。よろしいですか？')) return;
  const button = $('cleanupSongsBtn');
  button.disabled = true;
  button.textContent = '整理中…';
  try {
    const lookup = new Map(songCleanupData.map(item => [String(item.title).normalize('NFKC').trim().toLocaleLowerCase('ja'), item]));
    const byTitle = new Map(songs.map(song => [String(song.title || '').normalize('NFKC').trim().toLocaleLowerCase('ja'), song]));
    let updated = 0;
    let merged = 0;
    const batch = writeBatch(db);
    for (const song of songs) {
      const key = String(song.title || '').normalize('NFKC').trim().toLocaleLowerCase('ja');
      const data = lookup.get(key);
      if (!data) continue;
      const canonicalTitle = data.canonicalTitle || data.title;
      const canonicalKey = canonicalTitle.normalize('NFKC').trim().toLocaleLowerCase('ja');
      const existingCanonical = byTitle.get(canonicalKey);
      if (data.canonicalTitle && existingCanonical && existingCanonical.id !== song.id) {
        const mergeFields = {};
        if (!existingCanonical.lyrics && song.lyrics) mergeFields.lyrics = song.lyrics;
        if (!existingCanonical.link && song.link) mergeFields.link = song.link;
        if (!existingCanonical.memo && song.memo) mergeFields.memo = song.memo;
        if (!existingCanonical.album && song.album) mergeFields.album = song.album;
        if (!existingCanonical.releaseDate && song.releaseDate) mergeFields.releaseDate = song.releaseDate;
        if (!existingCanonical.reading && data.reading) mergeFields.reading = data.reading;
        if (Object.keys(mergeFields).length) {
          mergeFields.updatedAt = serverTimestamp();
          batch.update(doc(db, 'songs', existingCanonical.id), mergeFields);
        }
        batch.delete(doc(db, 'songs', song.id));
        merged++;
        continue;
      }
      const changes = {};
      if (canonicalTitle !== song.title) changes.title = canonicalTitle;
      if (data.reading && data.reading !== song.reading) changes.reading = data.reading;
      if (Object.keys(changes).length) {
        changes.updatedAt = serverTimestamp();
        batch.update(doc(db, 'songs', song.id), changes);
        updated++;
      }
    }
    await batch.commit();
    await reloadAll();
    alert(`曲データを整理しました。更新 ${updated}件、重複統合 ${merged}件です。`);
  } catch (error) {
    console.error(error);
    alert('曲データの整理に失敗しました。もう一度お試しください。');
  } finally {
    button.disabled = false;
    button.textContent = '曲データを整える';
  }
}

$('cleanupSongsBtn')?.addEventListener('click', cleanupSongData);


async function importInitialLives() {
  if (role !== 'admin') return;
  const existingKeys = new Set(lives.map(live => `${String(live.date || '').trim()}|${String(live.title || '').trim().toLocaleLowerCase('ja')}`));
  const missing = initialLives.filter(live => !existingKeys.has(`${live.date}|${live.title.trim().toLocaleLowerCase('ja')}`));
  if (!missing.length) {
    alert('確認済みのライブ予定はすべて登録済みです。');
    return;
  }
  if (!confirm(`${missing.length}件のライブ予定を一括登録します。日程変更の可能性があるため、公式サイトもあわせてご確認ください。`)) return;
  const button = $('seedLivesBtn');
  button.disabled = true;
  button.textContent = '登録中…';
  try {
    const batch = writeBatch(db);
    missing.forEach(live => {
      const ref = doc(collection(db, 'lives'));
      batch.set(ref, {
        title: live.title,
        date: live.date,
        time: live.time || '',
        venue: live.venue || '',
        seat: live.seat || '',
        attending: false,
        setlist: live.setlist || '',
        memo: live.memo || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });
    await batch.commit();
    await reloadAll();
    alert(`${missing.length}件のライブ予定を登録しました。`);
  } catch (error) {
    console.error(error);
    alert('ライブ予定の一括登録に失敗しました。もう一度お試しください。');
  } finally {
    button.disabled = false;
    button.textContent = 'ライブ予定を一括登録';
  }
}

$('seedLivesBtn')?.addEventListener('click', importInitialLives);


$('songSearch').addEventListener('input', renderSongs);
$('albumFilter')?.addEventListener('change', renderSongs);
$('liveFilter').addEventListener('change', renderLives);

function setLyricsFont(delta) {
  lyricsFontSize = Math.max(14, Math.min(32, lyricsFontSize + delta));
  localStorage.setItem('ck-lyrics-font-size', String(lyricsFontSize));
  $('viewSongLyrics').style.fontSize = `${lyricsFontSize}px`;
}
$('fontDownBtn').addEventListener('click', () => setLyricsFont(-2));
$('fontUpBtn').addEventListener('click', () => setLyricsFont(2));



function normalizeSongName(value) {
  return String(value || '').replace(/^\s*\d+[.．)）、:\-]?\s*/, '').trim().toLocaleLowerCase('ja');
}
function renderSetlist(text) {
  const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (!lines.length) {
    $('viewLiveSetlist').innerHTML = '<div class="muted">セットリストはまだ登録されていません。</div>';
    return;
  }
  $('viewLiveSetlist').innerHTML = lines.map((line, index) => {
    const normalized = normalizeSongName(line);
    const song = songs.find(item => normalizeSongName(item.title) === normalized);
    return `<div class="setlist-row"><span class="setlist-number">${index + 1}</span><button class="setlist-song ${song ? 'linked' : ''}" ${song ? `data-setlist-song="${song.id}"` : 'disabled'}>${esc(line.replace(/^\s*\d+[.．)）、:\-]?\s*/, ''))}</button></div>`;
  }).join('');
  $('viewLiveSetlist').querySelectorAll('[data-setlist-song]').forEach(button => button.addEventListener('click', () => {
    $('liveViewDialog').close();
    openSong(button.dataset.setlistSong);
  }));
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(console.error);
}
