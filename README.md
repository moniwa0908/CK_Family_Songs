# Ver.7.6.3 直近ライブ移動修正版

原因:
Ver.7.6.2には直近ライブへ移動する関数がありましたが、
下部タブのクリック処理が常にページ最上部へ戻しており、
ライブタブでも直近移動が実行されていませんでした。

修正:
- ライブタブを押したときだけ scrollToNearestLiveCard() を呼ぶ
- 他のタブは最上部へ
- Safariのレイアウト確定を待って80ms / 180ms / 350msでも再計算
- 専用NEXT LIVEカードは存在しない
- 実際のライブ一覧の直近カード位置へ移動

GitHubへ上書き:
- index.html
- app.js
- style.css
- service-worker.js
