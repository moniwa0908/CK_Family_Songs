# Ver.7.5.5 ライブ一覧スクロール修正版

修正:
- ライブタブを開いたときの「直近ライブを中央へ」の仕様は維持
- iPhone Safariで不安定な scrollIntoView(center) を廃止
- 実際の座標からスクロール位置を計算し、ページ上端/下端を超えないよう制限
- 上へスクロールした際に大きな空白が出る問題を対策
- 一覧末尾が固定の下部タブに隠れないよう、ライブ一覧の下余白を追加
- NEWSのNEW表示などVer.7.5.4のUIは維持

GitHubへ上書き:
index.html / app.js / style.css / service-worker.js
