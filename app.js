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
$('adminLoginBtn').addEventListener('click', openAdminLogin);
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

      $('roleBadge').textContent = role === 'admin' ? '管理者モード' : '家族閲覧モード';
      document.querySelectorAll('.admin-only').forEach(element => {
        element.classList.toggle('hidden', role !== 'admin');
      });
      $('adminLoginBtn').classList.toggle('hidden', role === 'admin');
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

  const lyrics = $('lyricsFilter')?.value || 'all';
  if (lyrics === 'with') result = result.filter(song => Boolean(String(song.lyrics || '').trim()));
  if (lyrics === 'missing') result = result.filter(song => !String(song.lyrics || '').trim());

  const video = $('videoFilter')?.value || 'all';
  if (video === 'with') result = result.filter(song => Boolean(String(song.link || '').trim()));
  if (video === 'missing') result = result.filter(song => !String(song.link || '').trim());

  const sort = $('songSort').value;
  if (sort === 'title') result.sort(compareSongsByKana);
  if (sort === 'release') result.sort((a, b) => (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999'));
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
  const today = new Date().toISOString().slice(0, 10);
  const ordered = [...lives].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const filter = $('liveFilter')?.value || 'all';
  const shown = ordered.filter(live => {
    if (filter === 'all') return true;
    if (filter === 'attending') return Boolean(live.attending) && live.date >= today;
    return filter === 'upcoming' ? live.date >= today : live.date < today;
  });
  $('liveList').innerHTML = shown.length
    ? shown.map(live => {
        const attending = Boolean(live.attending) && live.date >= today;
        return `<article class="item-card live-card ${attending ? 'attending-live' : ''}"><button class="card-open" data-live="${live.id}">
        <div class="live-badges"><span class="date-chip">${live.date >= today ? '今後' : '過去'}</span>${attending ? '<span class="attending-chip">★ 参加予定</span>' : ''}</div>
        <h3>${esc(live.title)}</h3>
        <div class="item-meta">${esc(formatDate(live.date))}${live.time ? ` ${esc(live.time)}` : ''} ・ ${esc(live.venue || '会場未設定')}</div>
      </button></article>`;
      }).join('')
    : '<div class="item-card muted">該当するライブはありません。</div>';
  $('liveList').querySelectorAll('[data-live]').forEach(button => {
    button.addEventListener('click', () => openLive(button.dataset.live));
  });
  const next = ordered.find(live => live.attending && live.date >= today) || ordered.find(live => live.date >= today);
  $('nextLiveTitle').textContent = next ? next.title : '今後のライブ予定はありません';
  $('nextLiveMeta').textContent = next ? `${formatDate(next.date)} ${next.time || ''} ${next.venue || ''}`.trim() : '';
}

function renderHome() {
  $('songCount').textContent = songs.length;
  $('liveCount').textContent = lives.length;
  $('favoriteCount').textContent = favorites.size;
  const latest = songs.slice(0, 4);
  $('recentSongs').innerHTML = latest.length
    ? latest.map(songCard).join('')
    : '<div class="item-card muted">管理者が曲を登録すると、ここに表示されます。</div>';
  bindSongCards($('recentSongs'));
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
  $('youtubeBtn').textContent = '▶ 登録済み動画を再生';
  $('favoriteBtn').textContent = favorites.has(id) ? '♥ お気に入り済み' : '♡ お気に入り';
  $('songViewDialog').showModal();
}

$('favoriteBtn').addEventListener('click', () => {
  if (!currentSong) return;
  toggleFavorite(currentSong.id);
  $('favoriteBtn').textContent = favorites.has(currentSong.id) ? '♥ お気に入り済み' : '♡ お気に入り';
});

$('youtubeBtn').addEventListener('click', () => {
  if (!currentSong?.link) return;
  window.open(currentSong.link, '_blank', 'noopener');
});


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
document.querySelectorAll('.bottom-nav button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.bottom-nav button').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.tab-page').forEach(page => page.classList.remove('active'));
    button.classList.add('active');
    $(button.dataset.tab).classList.add('active');
  });
});

$('homeSongsLink')?.addEventListener('click', () => {
  document.querySelector('.bottom-nav button[data-tab="songsTab"]')?.click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('homeLivesLink')?.addEventListener('click', () => {
  document.querySelector('.bottom-nav button[data-tab="livesTab"]')?.click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
$('songSort').addEventListener('change', renderSongs);
$('albumFilter')?.addEventListener('change', renderSongs);
$('lyricsFilter')?.addEventListener('change', renderSongs);
$('videoFilter')?.addEventListener('change', renderSongs);
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
