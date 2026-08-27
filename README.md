# Ver.7.5.9 ライブ画面完全リセット版

今回の対応:
- Ver.7.5.8で修正した正しいHTML構造を採用
- Safariのスクロール位置復元を無効化
- ライブタブを開くたび、複数タイミングでページ最上部へ強制リセット
- ライブ操作欄のstickyをライブ画面だけ解除
- livesTab / liveList の位置・transform・height・overflowを通常状態へ強制
- style.css / app.js に?v=759を付け、Safariの古いキャッシュを回避
- Service Workerも新キャッシュへ切替

GitHubへ上書き:
- index.html
- app.js
- style.css
- service-worker.js

今回は4ファイルすべて必ず上書きしてください。
