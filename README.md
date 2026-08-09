# CK Family Songs Ver.7.2.9

Ver.7.2.8が反映されない場合向けの強制反映版です。

- 旧 `.hero-card` の `min-height:170px` と `justify-content:end` を強い指定で上書き
- ライブカードの文字を上下中央へ
- カード高さを約112〜118pxまで縮小
- `style.css?v=729` として読み込み、iPhoneの古いCSSキャッシュを回避
- Service Workerのキャッシュ名も更新

GitHubへ上書き:
- index.html
- style.css
- service-worker.js
