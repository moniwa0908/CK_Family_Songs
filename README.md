# CK Family Songs Ver.7.5.0

ランダム連続再生時に、YouTube動画と歌詞が別の曲になる問題を修正しました。

修正内容:
- 現在画面に表示されているYouTube iframe本人からの通知だけ採用
- 過去のiframe・古い通知を無視
- YouTubeの `infoDelivery.videoData.video_id` を優先して現在動画を判定
- 動画IDと登録済みYouTube URLを照合して、その曲の歌詞を表示
- 同じ動画IDの通知では歌詞を何度も更新しない
- Ver.7.4.8のプレイリスト連続再生方式は維持

GitHubへ上書き:
- index.html
- app.js
- service-worker.js
