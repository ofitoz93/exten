# Subtitle Remote

Telefondan PC'ye klavye+mouse uzaktan kumanda. [Language Reactor](https://www.languagereactor.com/) ile Netflix/YouTube'da altyazı/çeviri kontrolünü yataktan yapmak için — bu proje sadece input relay'i, altyazı/çeviri işini Language Reactor zaten PC ekranında yapıyor.

## Kurulum

1. Node.js 20 LTS kurulu olsun (daha yeni sürümlerde nut.js'in native binding kurulumu derleyici gerektirebilir).
2. Bu klasörde: `npm install`
3. Chrome'a [Language Reactor](https://chrome.google.com/webstore/) eklentisini kur, eklentinin kendi ayarlarından şu eylemler için klavye kısayolu belirle: play/pause, önceki cümle, sonraki cümle, cümleyi tekrarla (varsa), geri/ileri sarma.
4. `server/config.json` içindeki `keymap` değerlerini Language Reactor'da seçtiğin kısayollarla **birebir** aynı yap (örn. `"prevSentence": "shift+left"`).

## Çalıştırma

- `start.bat` dosyasına çift tıkla (veya `npm start`).
- Terminalde LAN IP adresi, port ve bir **pairing token** yazdırılır, ayrıca bir QR kod gösterilir.
- Telefon **aynı WiFi ağında** olmalı. QR kodu telefon kamerasıyla taratırsan sayfa otomatik açılır ve eşleşir; manuel yapmak istersen terminaldeki `http://<ip>:<port>` adresini telefon tarayıcısında aç ve token'ı gir.

## Kullanım

- Önceki/Sonraki cümle, Play/Pause, Geri/İleri sar, Cümleyi tekrarla butonları Language Reactor kısayollarını tetikler.
- Trackpad alanı: parmağını sürükleyerek PC'deki mouse imlecini hareket ettirir — ekrandaki altyazıdaki bir kelimenin üstüne getirip kısa dokunuşla (veya **Tıkla** butonuyla) tıklayınca Language Reactor'ın kelime çeviri popup'ı açılır.

## Güvenlik notları

- Bağlantı `ws://` üzerinden, TLS yok. Bu araç sadece kendi ev LAN'ında, tek kullanıcı için tasarlandı — internete açılmamalı (router'da port yönlendirmesi yapma).
- Pairing token `server/token.json`'da saklanır ve sunucu her açıldığında aynı kalır. Token'ı iptal etmek istersen bu dosyayı sil ve sunucuyu yeniden başlat; yeni bir token üretilecek ve telefonun tekrar eşleşmesi gerekecek.

## Windows ile ilgili olası sorunlar

- **Firewall promptu**: Sunucu ilk açıldığında Windows "Allow this app..." sorabilir — **Private networks** kutusunu işaretleyip onayla, yoksa telefon sunucuya hiç erişemez. Kaçırırsan: Windows Defender Firewall ayarları > İzin verilen uygulamalar'dan manuel düzelt.
- **Antivirüs uyarısı**: Klavye/mouse simülasyonu yapan native modüller bazı antivirüs/SmartScreen tarafından şüpheli görülebilir; gerekirse proje klasörünü istisnaya ekle.
- **npm install hatası**: Native binding derleme hatası alırsan Node 20 LTS'e geç.
- **İmleç hedefi kayıyor**: Ekran ölçeklendirmesi (125%/150%) veya çoklu monitör varsa, `server/config.json` içindeki `mouse.sensitivity` değerini deneyerek ayarla.
- Yönetici izni gerekmez.

## Kapsam dışı (şimdilik yapılmadı)

- Ana ekrana ekleme / PWA
- Windows açılışında otomatik başlatma, tray icon
- UI'da hassasiyet ayarı slider'ı
- Otomatik LAN IP bulma (mDNS)
