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
  updateDoc
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { firebaseConfig, familyViewerEmail } from './firebase-config.js';

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

const favorites = new Set(JSON.parse(localStorage.getItem('ck-favorites') || '[]'));
let lyricsFontSize = Number(localStorage.getItem('ck-lyrics-font-size') || 18);
let scrollTimer = null;
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

function renderSongs() {
  let result = [...songs];
  const term = $('songSearch').value.trim().toLocaleLowerCase('ja');
  if (term) {
    result = result.filter(song => [song.title, song.album, song.lyrics, song.memo]
      .some(value => String(value || '').toLocaleLowerCase('ja').includes(term)));
  }
  const sort = $('songSort').value;
  if (sort === 'title') result.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
  if (sort === 'release') result.sort((a, b) => (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999'));
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
  const shown = ordered.filter(live => filter === 'all' || (filter === 'upcoming' ? live.date >= today : live.date < today));
  $('liveList').innerHTML = shown.length
    ? shown.map(live => `<article class="item-card"><button class="card-open" data-live="${live.id}">
        <span class="date-chip">${live.date >= today ? '今後' : '過去'}</span>
        <h3>${esc(live.title)}</h3>
        <div class="item-meta">${esc(formatDate(live.date))}${live.time ? ` ${esc(live.time)}` : ''} ・ ${esc(live.venue || '会場未設定')}</div>
      </button></article>`).join('')
    : '<div class="item-card muted">該当するライブはありません。</div>';
  $('liveList').querySelectorAll('[data-live]').forEach(button => {
    button.addEventListener('click', () => openLive(button.dataset.live));
  });
  const next = ordered.find(live => live.date >= today);
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
  stopAutoScroll();
  $('viewSongLyrics').textContent = currentSong.lyrics || '歌詞はまだ登録されていません。';
  $('viewSongLyrics').style.fontSize = `${lyricsFontSize}px`;
  $('autoScrollBtn').textContent = '▶ 自動スクロール';
  $('viewSongMemo').textContent = currentSong.memo || '';
  $('viewSongLink').classList.toggle('hidden', !currentSong.link);
  $('viewSongLink').href = currentSong.link || '#';
  $('favoriteBtn').textContent = favorites.has(id) ? '♥ お気に入り済み' : '♡ お気に入り';
  $('songViewDialog').showModal();
}

$('favoriteBtn').addEventListener('click', () => {
  if (!currentSong) return;
  toggleFavorite(currentSong.id);
  $('favoriteBtn').textContent = favorites.has(currentSong.id) ? '♥ お気に入り済み' : '♡ お気に入り';
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
  $('viewLiveTitle').textContent = currentLive.title;
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
$('songSearch').addEventListener('input', renderSongs);
$('songSort').addEventListener('change', renderSongs);
$('liveFilter').addEventListener('change', renderLives);

function setLyricsFont(delta) {
  lyricsFontSize = Math.max(14, Math.min(32, lyricsFontSize + delta));
  localStorage.setItem('ck-lyrics-font-size', String(lyricsFontSize));
  $('viewSongLyrics').style.fontSize = `${lyricsFontSize}px`;
}
$('fontDownBtn').addEventListener('click', () => setLyricsFont(-2));
$('fontUpBtn').addEventListener('click', () => setLyricsFont(2));

function stopAutoScroll() {
  if (scrollTimer) cancelAnimationFrame(scrollTimer);
  scrollTimer = null;
}
function autoScrollStep() {
  const dialog = $('songViewDialog');
  if (!dialog.open) return stopAutoScroll();
  const speed = Number($('scrollSpeed').value || 2);
  dialog.scrollTop += 0.25 + speed * 0.22;
  if (dialog.scrollTop + dialog.clientHeight >= dialog.scrollHeight - 2) {
    stopAutoScroll();
    $('autoScrollBtn').textContent = '▶ 自動スクロール';
    return;
  }
  scrollTimer = requestAnimationFrame(autoScrollStep);
}
$('autoScrollBtn').addEventListener('click', () => {
  if (scrollTimer) {
    stopAutoScroll();
    $('autoScrollBtn').textContent = '▶ 自動スクロール';
  } else {
    $('autoScrollBtn').textContent = '■ 停止';
    scrollTimer = requestAnimationFrame(autoScrollStep);
  }
});
$('songViewDialog').addEventListener('close', stopAutoScroll);

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
