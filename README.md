# Ver.7.7.1 家族共有ツアー再生
- Firebase Firestore `settings/tour2026_27` の `songIds` 配列に保存。
- 管理者のみツアー曲を登録・編集。家族は閲覧・ランダム再生のみ。
- ランダム再生タブで「2026/27 ツアーライブ再生」を選ぶと共有リストを再読込。
- 既存の全曲ランダム再生、歌詞、ライブ機能は維持。
- GitHubには index.html, app.js, style.css, service-worker.js を上書き。

## Firestore セキュリティルールに追加
既存の rules の `match /databases/{database}/documents { ... }` 内に以下を追加（既存ルールは消さない）。

```
match /settings/{settingId} {
  allow read: if request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'viewer'];
  allow write: if request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
    && settingId == 'tour2026_27';
}
```

※ Firebase の既存 rules に同じ `/settings/{settingId}` があれば統合してください。ルールの `allow` は OR 評価なので既存の広い許可を残すと管理者限定になりません。
