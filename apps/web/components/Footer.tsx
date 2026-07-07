export function Footer() {
  return (
    <footer className="siteFooter">
      <div className="shell footerGrid">
        <div>
          <a className="brand footerBrand" href="/">
            <span className="brandMark">E</span>
            <span>
              ENTAŞBURADA
              <small>Hırdavat ve yapı market B2B platformu</small>
            </span>
          </a>
          <p>
            Bayiler, yapı marketler, sanayi işletmeleri ve kurumsal satın alma ekipleri için güvenli katalog,
            teklif ve tedarik altyapısı.
          </p>
        </div>
        <div>
          <strong>Katalog</strong>
          <a href="/catalog">Ana Katalog</a>
          <a href="/catalog">Tüm kategoriler</a>
          <a href="/catalog?group=kampanyali-urunler">Kampanyalar</a>
          <a href="/catalog?group=yeni-urunler">Yeni ürünler</a>
          <a href="/technical-documents">Teknik dokümanlar</a>
        </div>
        <div>
          <strong>Bayi</strong>
          <a href="/login">Bayi girişi</a>
          <a href="/dealer-application">Bayi başvurusu</a>
          <a href="/quote">Teklif talep et</a>
          <a href="/corporate-purchase">Kurumsal satın alma</a>
        </div>
        <div>
          <strong>Kurumsal</strong>
          <a href="/about">Hakkımızda</a>
          <a href="/contact">İletişim</a>
          <a href="/kvkk">KVKK</a>
          <a href="/delivery">Kargo ve teslimat</a>
        </div>
      </div>
      <div className="shell footerBottom">
        <span>© 2026 ENTAŞBURADA</span>
        <span>Fiyatlar yalnızca onaylı bayi hesaplarında gösterilir.</span>
      </div>
    </footer>
  );
}
