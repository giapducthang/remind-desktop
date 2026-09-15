// ui-pickers.js - Food & drinks tab (the whole PICKERS section of the browser extension's side panel, ported).
// Contract: the picker spec §2 (schema), §7 (UI), §10 (Wikimedia images), §11.4 (server sets),
// §13/§14 (prices, changing times), §16/§17 (modal + cards shared with the Reminders tab).
// Differences from the extension: Platform.storage instead of chrome.storage; Scheduler.rebuild() instead of PICKERS_UPDATED;
// Scheduler.previewPicker(pickerOrId) instead of PREVIEW_PICKER. Every card/list/item is built with createElement + textContent.
// §21 (DESKTOP-SPEC): key `pickersAvailable` = false -> the tab shows only the notice card and hides the picker list,
//   the "Suggestions from Reminder" block, the empty state and the add button. User data is NEVER deleted.
// Exports: window.UIPickers = { init(), render(), openModal(picker) }.

(function () {
  'use strict';

  if (window.UIPickers) return;

  const PICKER_LIMITS = {
    maxPickers: 20,
    nameMax: 80,
    iconMax: 8,
    maxTimes: 10,
    minTimes: 1,
    maxWeekdays: 7,
    minWeekdays: 1,
    displayMin: 1,
    displayMax: 60,
    maxItems: 100,
    itemNameMax: 60,
    itemEmojiMax: 8,
    imageUrlMax: 2000,
    imageDataMax: 200 * 1024,   // 200 KB per image
    creditMax: 160,             // §10.2 imageCredit
    sourceMax: 2000,            // §10.2 imageSource (https)
    priceMax: 100000000,        // §13 VND
    imageResults: 12,           // §10.3 gsrlimit
    warnBytes: 2 * 1024 * 1024, // warn when `pickers` grows past 2 MB
    hardBytes: 3 * 1024 * 1024  // hard cap of 3 MB
  };

  // Item names are DATA (not translated). Images: Wikimedia Commons, only the URL + attribution are stored (§10.1) - images are NEVER bundled.
  // The array below is copied verbatim from the browser extension's side panel (PICKER_VIETNAMESE_SAMPLE, 55 items).
  const PICKER_VIETNAMESE_SAMPLE = [
    { name: "Cơm tấm", emoji: '🍚',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/40/C%C6%A1m_t%E1%BA%A5m_s%C6%B0%E1%BB%9Dn_c%C3%A2y.JPG/500px-C%C6%A1m_t%E1%BA%A5m_s%C6%B0%E1%BB%9Dn_c%C3%A2y.JPG',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:C%C6%A1m_t%E1%BA%A5m_s%C6%B0%E1%BB%9Dn_c%C3%A2y.JPG' },
    { name: "Phở bò", emoji: '🍜',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/65/Beef_noodle_soup_%28Ph%E1%BB%9F_b%C3%B2%29_-_Pho_Hanoi_Authentic_2024-12-01.jpg/500px-Beef_noodle_soup_%28Ph%E1%BB%9F_b%C3%B2%29_-_Pho_Hanoi_Authentic_2024-12-01.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Beef_noodle_soup_(Ph%E1%BB%9F_b%C3%B2)_-_Pho_Hanoi_Authentic_2024-12-01.jpg' },
    { name: "Bánh mì", emoji: '🥖',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3f/B%C3%A1nh_M%C3%AC_with_Spicy_Miso_Aubergine%2C_Kimchi_-_Earl%27s_Sandwiches_2023-09-25.jpg/500px-B%C3%A1nh_M%C3%AC_with_Spicy_Miso_Aubergine%2C_Kimchi_-_Earl%27s_Sandwiches_2023-09-25.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:B%C3%A1nh_M%C3%AC_with_Spicy_Miso_Aubergine,_Kimchi_-_Earl%27s_Sandwiches_2023-09-25.jpg' },
    { name: "Bún chả", emoji: '🍜',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/32/B%C3%BAn_ch%E1%BA%A3_c%C3%A1%2C_th%C3%A1ng_8_n%C4%83m_2018.JPG/500px-B%C3%BAn_ch%E1%BA%A3_c%C3%A1%2C_th%C3%A1ng_8_n%C4%83m_2018.JPG',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:B%C3%BAn_ch%E1%BA%A3_c%C3%A1,_th%C3%A1ng_8_n%C4%83m_2018.JPG' },
    { name: "Cơm chay", emoji: '🥬',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b2/Vietnamese_family_daily_meal.jpg/500px-Vietnamese_family_daily_meal.jpg',
      imageCredit: "Hoangkid · CC BY-SA 4.0",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Vietnamese_family_daily_meal.jpg' },
    { name: "Cơm gà Hội An", emoji: '🍗',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3f/Thai_and_hoi_nan_chicken_in_half.jpg/500px-Thai_and_hoi_nan_chicken_in_half.jpg',
      imageCredit: "Geoffreyrabbit · CC BY-SA 4.0",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Thai_and_hoi_nan_chicken_in_half.jpg' },
    { name: "Bún bò Huế", emoji: '🍜',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6d/Bun_Bo_Hue_and_Bun_Thit_Nuong.jpg/500px-Bun_Bo_Hue_and_Bun_Thit_Nuong.jpg',
      imageCredit: "bopuc · CC BY 2.0",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Bun_Bo_Hue_and_Bun_Thit_Nuong.jpg' },
    { name: "Hủ tiếu", emoji: '🍜',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cc/Stir-fried_noodles_with_soy_sauce.jpg/500px-Stir-fried_noodles_with_soy_sauce.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Stir-fried_noodles_with_soy_sauce.jpg' },
    { name: "Mì Quảng", emoji: '🍜',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/44/Mi_Quang_-_Quan_Hat_Mi_Quang%2C_Cao_Lau_VND2000.jpg/500px-Mi_Quang_-_Quan_Hat_Mi_Quang%2C_Cao_Lau_VND2000.jpg',
      imageCredit: "Alpha · CC BY-SA 2.0",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Mi_Quang_-_Quan_Hat_Mi_Quang,_Cao_Lau_VND2000.jpg' },
    { name: "Bún thịt nướng", emoji: '🍜',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/47/Bun_thit_nuong.jpg/500px-Bun_thit_nuong.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Bun_thit_nuong.jpg' },
    { name: "Bánh cuốn", emoji: '🥟',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a7/Banh_cuon.jpg/500px-Banh_cuon.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Banh_cuon.jpg' },
    { name: "Bún đậu mắm tôm", emoji: '🍜',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d9/B%C3%BAn_%C4%91%E1%BA%ADu_m%E1%BA%AFm_t%C3%B4m_qu%C3%A1n_3_ch%E1%BB%8B_em_t%E1%BA%A1i_Nguy%E1%BB%85n_S%C6%A1n_n%C4%83m_2016_%289%29.jpg/500px-B%C3%BAn_%C4%91%E1%BA%ADu_m%E1%BA%AFm_t%C3%B4m_qu%C3%A1n_3_ch%E1%BB%8B_em_t%E1%BA%A1i_Nguy%E1%BB%85n_S%C6%A1n_n%C4%83m_2016_%289%29.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:B%C3%BAn_%C4%91%E1%BA%ADu_m%E1%BA%AFm_t%C3%B4m_qu%C3%A1n_3_ch%E1%BB%8B_em_t%E1%BA%A1i_Nguy%E1%BB%85n_S%C6%A1n_n%C4%83m_2016_(9).jpg' },
    { name: "Cơm rang dưa bò", emoji: '🥩',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d0/Ground_beef%2C_fried%2C_on_sticky_white_rice_with_Kansas_City_barbeque_sauce_and_black_pepper_-_Massachusetts.jpg/500px-Ground_beef%2C_fried%2C_on_sticky_white_rice_with_Kansas_City_barbeque_sauce_and_black_pepper_-_Massachusetts.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Ground_beef,_fried,_on_sticky_white_rice_with_Kansas_City_barbeque_sauce_and_black_pepper_-_Massachusetts.jpg' },
    { name: "Bò lúc lắc", emoji: '🥩',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e2/Sachko_lok_lak_-_beef_lok_lak_th%E1%BB%8Bt_b%C3%B2_l%C3%BAc_l%E1%BA%AFc_Khmer_food.jpg/500px-Sachko_lok_lak_-_beef_lok_lak_th%E1%BB%8Bt_b%C3%B2_l%C3%BAc_l%E1%BA%AFc_Khmer_food.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Sachko_lok_lak_-_beef_lok_lak_th%E1%BB%8Bt_b%C3%B2_l%C3%BAc_l%E1%BA%AFc_Khmer_food.jpg' },
    { name: "Bánh xèo", emoji: '🥞',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/40/Crispy_Vietnamese_Pancake_%28Banh_Xeo%29_-_Xin_Chao%2C_Eastbourne_2026-08-14_%282%29.jpg/500px-Crispy_Vietnamese_Pancake_%28Banh_Xeo%29_-_Xin_Chao%2C_Eastbourne_2026-08-14_%282%29.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Crispy_Vietnamese_Pancake_(Banh_Xeo)_-_Xin_Chao,_Eastbourne_2026-08-14_(2).jpg' },
    { name: "Bánh đa cua", emoji: '🦐',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d1/Banhcanhcua.jpg/500px-Banhcanhcua.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Banhcanhcua.jpg' },
    { name: "Bún cá", emoji: '🍜',
      image: '',
      imageCredit: "",
      imageSource: '' },
    { name: "Gỏi cuốn", emoji: '🥟',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f3/Rollos_goi_cuon%2C_Mazatl%C3%A1n%2C_31_de_mayo_de_2023.jpg/500px-Rollos_goi_cuon%2C_Mazatl%C3%A1n%2C_31_de_mayo_de_2023.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Rollos_goi_cuon,_Mazatl%C3%A1n,_31_de_mayo_de_2023.jpg' },
    { name: "Cháo sườn", emoji: '🥣',
      image: '',
      imageCredit: "",
      imageSource: '' },
    { name: "Lẩu nấm chay", emoji: '🍲',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/33/L%E1%BA%A9u_chua_cay_Phan_X%C3%ADch_Long%2C_n%C4%83m_2017_%281%29.jpg/500px-L%E1%BA%A9u_chua_cay_Phan_X%C3%ADch_Long%2C_n%C4%83m_2017_%281%29.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:L%E1%BA%A9u_chua_cay_Phan_X%C3%ADch_Long,_n%C4%83m_2017_(1).jpg' },
    { name: "Bánh mì chay", emoji: '🥖',
      image: '',
      imageCredit: "",
      imageSource: '' },
    { name: "Gỏi cuốn chay", emoji: '🥬',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/62/Chill_Out_Vegie_Spring_Rolls.jpg/500px-Chill_Out_Vegie_Spring_Rolls.jpg',
      imageCredit: "Infrogmation of New Orleans · CC BY 2.0",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Chill_Out_Vegie_Spring_Rolls.jpg' },
    { name: "Cơm bình dân", emoji: '🍚',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/71/C%C6%A1m_t%E1%BA%A5m_s%C6%B0%E1%BB%9Dn_ch%E1%BA%A3_%28ch%E1%BA%A3_tr%E1%BB%A9ng%29_t%E1%BA%A1i_qu%C3%A1n_c%C6%A1m_b%C3%ACnh_d%C3%A2n_%C4%91%C6%B0%E1%BB%9Dng_NS_ng25th9n2022_%28d%C4%A9a_c%C6%A1m_r%C6%B0%E1%BB%9Dn_ch%E1%BA%A3%29_%281%29.jpg/500px-C%C6%A1m_t%E1%BA%A5m_s%C6%B0%E1%BB%9Dn_ch%E1%BA%A3_%28ch%E1%BA%A3_tr%E1%BB%A9ng%29_t%E1%BA%A1i_qu%C3%A1n_c%C6%A1m_b%C3%ACnh_d%C3%A2n_%C4%91%C6%B0%E1%BB%9Dng_NS_ng25th9n2022_%28d%C4%A9a_c%C6%A1m_r%C6%B0%E1%BB%9Dn_ch%E1%BA%A3%29_%281%29.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:C%C6%A1m_t%E1%BA%A5m_s%C6%B0%E1%BB%9Dn_ch%E1%BA%A3_(ch%E1%BA%A3_tr%E1%BB%A9ng)_t%E1%BA%A1i_qu%C3%A1n_c%C6%A1m_b%C3%ACnh_d%C3%A2n_%C4%91%C6%B0%E1%BB%9Dng_NS_ng25th9n2022_(d%C4%A9a_c%C6%A1m_r%C6%B0%E1%BB%9Dn_ch%E1%BA%A3)_(1).jpg' },
    { name: "Cơm gà xối mỡ", emoji: '🍗',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/63/Siam_Fried_Rice_with_Chicken_by_Papaya%2C_Hove.jpg/500px-Siam_Fried_Rice_with_Chicken_by_Papaya%2C_Hove.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Siam_Fried_Rice_with_Chicken_by_Papaya,_Hove.jpg' },
    { name: "Bún riêu", emoji: '🍜',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bb/Vietnamese_vegetarian_crab_noodle_soup.jpg/500px-Vietnamese_vegetarian_crab_noodle_soup.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Vietnamese_vegetarian_crab_noodle_soup.jpg' },
    { name: "Bánh canh cua", emoji: '🍲',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/ba/Banh_Canh_with_Pork_Knuckle%2C_Pork_Blood_Jelly%2C_Prawn_Cakes_in_Tomato_and_Crab_Soup_-_Hoa_Tran_AUD9_%283999697937%29.jpg/500px-Banh_Canh_with_Pork_Knuckle%2C_Pork_Blood_Jelly%2C_Prawn_Cakes_in_Tomato_and_Crab_Soup_-_Hoa_Tran_AUD9_%283999697937%29.jpg',
      imageCredit: "Alpha from Melbourne, Australia · CC BY-SA 2.0",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Banh_Canh_with_Pork_Knuckle,_Pork_Blood_Jelly,_Prawn_Cakes_in_Tomato_and_Crab_Soup_-_Hoa_Tran_AUD9_(3999697937).jpg' },
    { name: "Bò né", emoji: '🥩',
      image: '',
      imageCredit: "",
      imageSource: '' },
    { name: "Cơm heo chiên xù", emoji: '🍖',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/63/Katsuya_Katsudon_Ume.jpg/500px-Katsuya_Katsudon_Ume.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Katsuya_Katsudon_Ume.jpg' },
    { name: "Cơm chiên hải sản", emoji: '🦐',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/35/HK_SYP_%E8%A5%BF%E7%92%B0_Sai_Ying_Pun_%E5%BE%B7%E8%BC%94%E9%81%93%E8%A5%BF_308_Des_Voeux_Road_West_%E9%A3%9F%E7%A5%9E%E9%BA%97%E5%AE%AE%E9%85%92%E5%AE%B6_Chinese_Banquet_Seafood_Restaurant_food_%E7%91%A4%E6%9F%B1%E8%9B%8B%E7%99%BD%E7%82%92%E9%A3%AF_Cantonese_fried_rice_with_dried_scallop_and_egg_white_January_2026_N13P_02.jpg/500px-thumbnail.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:HK_SYP_%E8%A5%BF%E7%92%B0_Sai_Ying_Pun_%E5%BE%B7%E8%BC%94%E9%81%93%E8%A5%BF_308_Des_Voeux_Road_West_%E9%A3%9F%E7%A5%9E%E9%BA%97%E5%AE%AE%E9%85%92%E5%AE%B6_Chinese_Banquet_Seafood_Restaurant_food_%E7%91%A4%E6%9F%B1%E8%9B%8B%E7%99%BD%E7%82%92%E9%A3%AF_Cantonese_fried_rice_with_dried_scallop_and_egg_white_January_2026_N13P_02.jpg' },
    { name: "Cơm cá saba nướng", emoji: '🐟',
      image: '',
      imageCredit: "",
      imageSource: '' },
    { name: "Lẩu bò cá nhân", emoji: '🍲',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/87/Ttukbaegi_bulgogi_-_Bulgogi%28beef%29_hot_pot_-_Kogi_Korean_cuisine_2024-09-03.jpg/500px-Ttukbaegi_bulgogi_-_Bulgogi%28beef%29_hot_pot_-_Kogi_Korean_cuisine_2024-09-03.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Ttukbaegi_bulgogi_-_Bulgogi(beef)_hot_pot_-_Kogi_Korean_cuisine_2024-09-03.jpg' },
    { name: "Phở gà", emoji: '🍜',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b4/Chicken-pho-vietnamese-soup.JPG/500px-Chicken-pho-vietnamese-soup.JPG',
      imageCredit: "Anonymous Cow · CC BY 2.0",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Chicken-pho-vietnamese-soup.JPG' },
    { name: "Phở cuốn", emoji: '🍜',
      image: '',
      imageCredit: "",
      imageSource: '' },
    { name: "Bún mọc", emoji: '🍜',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/91/B%C3%BAn_m%E1%BB%8Dc_s%C6%B0%E1%BB%9Dn_non_t%E1%BA%A1i_%C4%91%C6%B0%E1%BB%9Dng_Nguy%E1%BB%85n_S%C6%A1n%2C_T%C3%A2n_Ph%C3%BA_%28th%C3%A1ng_8_n%C4%83m_2018%29_%282%29.jpg/500px-B%C3%BAn_m%E1%BB%8Dc_s%C6%B0%E1%BB%9Dn_non_t%E1%BA%A1i_%C4%91%C6%B0%E1%BB%9Dng_Nguy%E1%BB%85n_S%C6%A1n%2C_T%C3%A2n_Ph%C3%BA_%28th%C3%A1ng_8_n%C4%83m_2018%29_%282%29.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:B%C3%BAn_m%E1%BB%8Dc_s%C6%B0%E1%BB%9Dn_non_t%E1%BA%A1i_%C4%91%C6%B0%E1%BB%9Dng_Nguy%E1%BB%85n_S%C6%A1n,_T%C3%A2n_Ph%C3%BA_(th%C3%A1ng_8_n%C4%83m_2018)_(2).jpg' },
    { name: "Bún măng vịt", emoji: '🍜',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0f/B%C3%BAn_m%C4%83ng_th%E1%BB%8Bt_v%E1%BB%8Bt.jpg/500px-B%C3%BAn_m%C4%83ng_th%E1%BB%8Bt_v%E1%BB%8Bt.jpg',
      imageCredit: "yuchinkay · CC BY 2.0",
      imageSource: 'https://commons.wikimedia.org/wiki/File:B%C3%BAn_m%C4%83ng_th%E1%BB%8Bt_v%E1%BB%8Bt.jpg' },
    { name: "Bún bò Nam Bộ", emoji: '🍜',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/81/B%C3%BAn_b%C3%B2_b%E1%BA%AFp_Nguy%E1%BB%85n_S%C6%A1n_n%C4%83m_2018.jpg/500px-B%C3%BAn_b%C3%B2_b%E1%BA%AFp_Nguy%E1%BB%85n_S%C6%A1n_n%C4%83m_2018.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:B%C3%BAn_b%C3%B2_b%E1%BA%AFp_Nguy%E1%BB%85n_S%C6%A1n_n%C4%83m_2018.jpg' },
    { name: "Bún mắm", emoji: '🍜',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/94/B%C3%BAn_m%E1%BA%AFm_B%E1%BA%A1c_Li%C3%AAu_t%E1%BA%A1i_%C4%91%C6%B0%E1%BB%9Dng_Nguy%E1%BB%85n_S%C6%A1n_th%C3%A1ng_7_n%C4%83m_2016_%286%29.jpg/500px-B%C3%BAn_m%E1%BA%AFm_B%E1%BA%A1c_Li%C3%AAu_t%E1%BA%A1i_%C4%91%C6%B0%E1%BB%9Dng_Nguy%E1%BB%85n_S%C6%A1n_th%C3%A1ng_7_n%C4%83m_2016_%286%29.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:B%C3%BAn_m%E1%BA%AFm_B%E1%BA%A1c_Li%C3%AAu_t%E1%BA%A1i_%C4%91%C6%B0%E1%BB%9Dng_Nguy%E1%BB%85n_S%C6%A1n_th%C3%A1ng_7_n%C4%83m_2016_(6).jpg' },
    { name: "Bún chay", emoji: '🍜',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/16/Chickpea_noodle_soup_%2842274824525%29.jpg/500px-Chickpea_noodle_soup_%2842274824525%29.jpg',
      imageCredit: "Joey Doll · CC BY 2.0",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Chickpea_noodle_soup_(42274824525).jpg' },
    { name: "Bánh canh giò heo", emoji: '🍲',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c4/Banh-Canh-Noodle-Soup.jpg/500px-Banh-Canh-Noodle-Soup.jpg',
      imageCredit: "Kham Tran - www.khamtran.com · CC BY 3.0",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Banh-Canh-Noodle-Soup.jpg' },
    { name: "Miến gà", emoji: '🍜',
      image: '',
      imageCredit: "",
      imageSource: '' },
    { name: "Miến lươn", emoji: '🍜',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d7/Mien_luon_Hang_Dieu.JPG/500px-Mien_luon_Hang_Dieu.JPG',
      imageCredit: "vi:User:Rungbachduong · CC BY-SA 3.0",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Mien_luon_Hang_Dieu.JPG' },
    { name: "Cháo vịt", emoji: '🥣',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c9/B%C3%A1nh_canh_v%E1%BB%8Bt_%28ch%C3%A1o_v%E1%BB%8Bt%29_Ph%C6%B0%E1%BB%9Dng_3-%C4%90%C3%B4ng_H%C3%A0_%28Chu%E1%BB%93n_con_m%E1%BB%A5_Qu%E1%BB%B5%29_%281%29.jpg/500px-B%C3%A1nh_canh_v%E1%BB%8Bt_%28ch%C3%A1o_v%E1%BB%8Bt%29_Ph%C6%B0%E1%BB%9Dng_3-%C4%90%C3%B4ng_H%C3%A0_%28Chu%E1%BB%93n_con_m%E1%BB%A5_Qu%E1%BB%B5%29_%281%29.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:B%C3%A1nh_canh_v%E1%BB%8Bt_(ch%C3%A1o_v%E1%BB%8Bt)_Ph%C6%B0%E1%BB%9Dng_3-%C4%90%C3%B4ng_H%C3%A0_(Chu%E1%BB%93n_con_m%E1%BB%A5_Qu%E1%BB%B5)_(1).jpg' },
    { name: "Cháo lòng", emoji: '🥣',
      image: '',
      imageCredit: "",
      imageSource: '' },
    { name: "Bánh hỏi heo quay", emoji: '🍖',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a0/B%C3%A1nh_h%E1%BB%8Fi_th%E1%BB%8Bt_quay.JPG/500px-B%C3%A1nh_h%E1%BB%8Fi_th%E1%BB%8Bt_quay.JPG',
      imageCredit: "Ngô Trung · CC BY-SA 3.0",
      imageSource: 'https://commons.wikimedia.org/wiki/File:B%C3%A1nh_h%E1%BB%8Fi_th%E1%BB%8Bt_quay.JPG' },
    { name: "Nem nướng", emoji: '🥟',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/94/Nem_Nuong_2018-07-29.jpg/500px-Nem_Nuong_2018-07-29.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Nem_Nuong_2018-07-29.jpg' },
    { name: "Canh đậu hũ non kèm cơm", emoji: '🍲',
      image: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/KOCIS_sundubu-jjigae%2C_Spicy_Soft_Tofu_Stew_%284556151465%29.jpg',
      imageCredit: "Korea.net / Korean Culture and Information Service · CC BY-SA 2.0",
      imageSource: 'https://commons.wikimedia.org/wiki/File:KOCIS_sundubu-jjigae,_Spicy_Soft_Tofu_Stew_(4556151465).jpg' },
    { name: "Bánh cuộn gà", emoji: '🍗',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/79/Buffalo_chicken_wrap_-_Dunedin%2C_New_Zealand.jpg/500px-Buffalo_chicken_wrap_-_Dunedin%2C_New_Zealand.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Buffalo_chicken_wrap_-_Dunedin,_New_Zealand.jpg' },
    { name: "Nui xào bò", emoji: '🍝',
      image: '',
      imageCredit: "",
      imageSource: '' },
    { name: "Cháo gà", emoji: '🥣',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/99/Chok_tomyam_%28tomyam_congee%29%2C_chicken_ver%2C_Bangkok%2C_2018-01-21.jpg/500px-Chok_tomyam_%28tomyam_congee%29%2C_chicken_ver%2C_Bangkok%2C_2018-01-21.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Chok_tomyam_(tomyam_congee),_chicken_ver,_Bangkok,_2018-01-21.jpg' },
    { name: "Bò kho bánh mì", emoji: '🥖',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7f/B%C3%A1nh_m%C3%AC_b%C3%B2_kho_%E1%BB%9F_c%C3%A0_ph%C3%AA_Nguy%E1%BB%87t_Ca.jpg/500px-B%C3%A1nh_m%C3%AC_b%C3%B2_kho_%E1%BB%9F_c%C3%A0_ph%C3%AA_Nguy%E1%BB%87t_Ca.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:B%C3%A1nh_m%C3%AC_b%C3%B2_kho_%E1%BB%9F_c%C3%A0_ph%C3%AA_Nguy%E1%BB%87t_Ca.jpg' },
    { name: "Xôi mặn", emoji: '🍙',
      image: '',
      imageCredit: "",
      imageSource: '' },
    { name: "Bánh mì chảo", emoji: '🥖',
      image: '',
      imageCredit: "",
      imageSource: '' },
    { name: "Cơm xá xíu", emoji: '🍖',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/37/Gfp-bbq-pork-over-rice.jpg/500px-Gfp-bbq-pork-over-rice.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Gfp-bbq-pork-over-rice.jpg' },
    { name: "Cơm vịt quay", emoji: '🍚',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f0/HK_STT_Shek_Tong_Tsui_shop_Tang%27s_Roast_Siu_Mei_food_Siu_Yuk_salted_duck_egg_rice_lunch_plastic_box_August_2026_N13P_01.jpg/500px-HK_STT_Shek_Tong_Tsui_shop_Tang%27s_Roast_Siu_Mei_food_Siu_Yuk_salted_duck_egg_rice_lunch_plastic_box_August_2026_N13P_01.jpg',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:HK_STT_Shek_Tong_Tsui_shop_Tang%27s_Roast_Siu_Mei_food_Siu_Yuk_salted_duck_egg_rice_lunch_plastic_box_August_2026_N13P_01.jpg' },
    { name: "Miến xào", emoji: '🍜',
      image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fa/Mi%E1%BA%BFn_x%C3%A0o_l%C3%B2ng_c%E1%BA%ADt%2C_th%C3%A1ng_8_n%C4%83m_2018.JPG/500px-Mi%E1%BA%BFn_x%C3%A0o_l%C3%B2ng_c%E1%BA%ADt%2C_th%C3%A1ng_8_n%C4%83m_2018.JPG',
      imageCredit: "",
      imageSource: 'https://commons.wikimedia.org/wiki/File:Mi%E1%BA%BFn_x%C3%A0o_l%C3%B2ng_c%E1%BA%ADt,_th%C3%A1ng_8_n%C4%83m_2018.JPG' }];

  const PICKER_WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];       // displayed Mon..Sun
  const PICKER_WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  const PICKER_COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

  // SVG icons for the item row buttons (feather, same set as the sidebar)
  const PICKER_ICON_SHAPES = {
    edit: [
      ['path', { d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }],
      ['path', { d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' }]
    ],
    delete: [
      ['polyline', { points: '3 6 5 6 21 6' }],
      ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }]
    ]
  };

  let pickers = [];
  let serverPickers = [];
  let serverPickerPrefs = {};
  let pickersAvailable = true;   // §21: a missing key means true (available by default)
  let initialized = false;
  let selfWriting = false;

  // The draft currently open in the modal (only written to `pickers` when Save is clicked)
  let _pkDraft = null;
  let _pkEditingItemId = null;
  let _pkItemImage = '';
  let _pkItemImageCredit = '';
  let _pkItemImageSource = '';
  let _pkImageSearchToken = 0;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function A() { return window.App; }
  function P() { return window.Platform; }
  function t(key) { return A() ? A().t(key) : key; }
  function toast(msg, type) { if (A()) A().showToast(msg, type); }
  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function buildPickerIcon(kind) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    (PICKER_ICON_SHAPES[kind] || []).forEach(([tag, attrs]) => {
      const node = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach((k) => node.setAttribute(k, attrs[k]));
      svg.appendChild(node);
    });
    return svg;
  }

  function createPickerActionButton(kind, labelKey, extraClass) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-icon-sm' + (extraClass ? ' ' + extraClass : '');
    btn.appendChild(buildPickerIcon(kind));
    const label = t(labelKey);
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('data-i18n-title', labelKey);
    btn.setAttribute('data-i18n-aria', labelKey);
    return btn;
  }

  // ---------- pure helpers ----------
  function isPickerTime(value) { return typeof value === 'string' && TIME_RE.test(value); }

  function normalizePickerImage(value) {
    if (typeof value !== 'string') return { ok: true, value: '' };
    const v = value.trim();
    if (!v) return { ok: true, value: '' };
    if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v)) {
      if (v.length > PICKER_LIMITS.imageDataMax) return { ok: false, error: 'pickerErrorImageTooLarge' };
      return { ok: true, value: v };
    }
    if (/^https:\/\/[^\s<>"'\\]+$/i.test(v)) {
      if (v.length > PICKER_LIMITS.imageUrlMax) return { ok: false, error: 'pickerErrorImageUrlLong' };
      return { ok: true, value: v };
    }
    return { ok: false, error: 'pickerErrorImageProtocol' };
  }

  function normalizePickerCredit(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, PICKER_LIMITS.creditMax);
  }

  function normalizePickerSource(value) {
    if (typeof value !== 'string') return '';
    const v = value.trim();
    if (!v) return '';
    if (!/^https:\/\/[^\s<>"'\\]+$/i.test(v)) return '';
    if (v.length > PICKER_LIMITS.sourceMax) return '';
    return v;
  }

  // §13: an integer VND price from 0 to 100 million; a wrong type or a negative value becomes 0 (same as the sanitizer's cleanPickerItem)
  function pickerPrice(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(PICKER_LIMITS.priceMax, n);
  }

  function pickerSafeImageSrc(value) {
    const res = normalizePickerImage(value);
    return res.ok ? res.value : '';
  }

  function estimatePickersBytes(list) {
    let json;
    try { json = JSON.stringify(list || []); } catch (e) { return 0; }
    if (typeof Blob === 'function') { try { return new Blob([json]).size; } catch (e) { /* ignore */ } }
    if (typeof TextEncoder === 'function') { try { return new TextEncoder().encode(json).length; } catch (e) { /* ignore */ } }
    return json.length;
  }

  function validatePickerDraft(draft) {
    const errors = [];
    const name = typeof draft.name === 'string' ? draft.name.trim() : '';
    if (!name || name.length > PICKER_LIMITS.nameMax) errors.push({ field: 'name', key: 'pickerErrorName' });

    const icon = typeof draft.icon === 'string' ? draft.icon.trim() : '';
    if (Array.from(icon).length > PICKER_LIMITS.iconMax) errors.push({ field: 'icon', key: 'pickerErrorIcon' });

    const times = Array.isArray(draft.times) ? draft.times : [];
    if (times.length < PICKER_LIMITS.minTimes) errors.push({ field: 'times', key: 'pickerErrorNoTime' });
    else if (times.length > PICKER_LIMITS.maxTimes) errors.push({ field: 'times', key: 'pickerErrorMaxTimes' });
    else if (!times.every(isPickerTime)) errors.push({ field: 'times', key: 'pickerErrorTimeFormat' });

    const weekdays = Array.isArray(draft.weekdays) ? draft.weekdays : [];
    const validDays = Array.from(new Set(weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)));
    if (validDays.length < PICKER_LIMITS.minWeekdays || validDays.length > PICKER_LIMITS.maxWeekdays) {
      errors.push({ field: 'weekdays', key: 'pickerErrorNoWeekday' });
    }

    const minutes = Number(draft.displayMinutes);
    if (!Number.isFinite(minutes) || minutes < PICKER_LIMITS.displayMin || minutes > PICKER_LIMITS.displayMax) {
      errors.push({ field: 'duration', key: 'pickerErrorDuration' });
    }

    const items = Array.isArray(draft.items) ? draft.items : [];
    if (items.length > PICKER_LIMITS.maxItems) errors.push({ field: 'items', key: 'pickerErrorMaxItems' });
    for (const it of items) {
      const itName = it && typeof it.name === 'string' ? it.name.trim() : '';
      if (!itName || itName.length > PICKER_LIMITS.itemNameMax) { errors.push({ field: 'items', key: 'pickerErrorItemName' }); break; }
      const itEmoji = it && typeof it.emoji === 'string' ? it.emoji.trim() : '';
      if (Array.from(itEmoji).length > PICKER_LIMITS.itemEmojiMax) { errors.push({ field: 'items', key: 'pickerErrorItemEmoji' }); break; }
      const img = normalizePickerImage(it && it.image);
      if (!img.ok) { errors.push({ field: 'items', key: img.error }); break; }
      if (it && it.imageCredit !== undefined && typeof it.imageCredit !== 'string') { errors.push({ field: 'items', key: 'pickerErrorImageCredit' }); break; }
      if (it && it.imageSource !== undefined && typeof it.imageSource !== 'string') { errors.push({ field: 'items', key: 'pickerErrorImageCredit' }); break; }
    }
    return errors;
  }

  // A clean record matching the §2 + §10.2 + §13 schema (unknown fields are dropped)
  function buildPickerRecord(draft) {
    const times = Array.from(new Set((draft.times || []).filter(isPickerTime))).sort();
    const weekdays = Array.from(new Set((draft.weekdays || []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort((a, b) => a - b);
    const items = (draft.items || []).slice(0, PICKER_LIMITS.maxItems).map((it) => {
      const image = normalizePickerImage(it.image).value || '';
      let priceMin = pickerPrice(it.priceMin);
      let priceMax = pickerPrice(it.priceMax);
      if (priceMin > priceMax) { priceMin = 0; priceMax = 0; }
      return {
        id: String(it.id),
        name: String(it.name).trim().slice(0, PICKER_LIMITS.itemNameMax),
        emoji: String(it.emoji || '').trim(),
        image,
        imageCredit: image ? normalizePickerCredit(it.imageCredit) : '',
        imageSource: image ? normalizePickerSource(it.imageSource) : '',
        priceMin,
        priceMax
      };
    });
    const record = {
      id: String(draft.id),
      name: String(draft.name).trim().slice(0, PICKER_LIMITS.nameMax),
      icon: (String(draft.icon || '').trim() || '🍽️'),
      enabled: draft.enabled !== false,
      times,
      weekdays,
      displayMinutes: Math.min(PICKER_LIMITS.displayMax, Math.max(PICKER_LIMITS.displayMin, Math.round(Number(draft.displayMinutes) || 1))),
      items
    };
    if (typeof draft.lastPickedId === 'string' && draft.lastPickedId) record.lastPickedId = draft.lastPickedId;
    return record;
  }

  function formatPickerWeekdays(weekdays) {
    const uniq = Array.from(new Set((weekdays || []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)));
    if (uniq.length === 0) return '';
    if (uniq.length === 7) return t('everyDay');
    const positions = uniq.map((d) => PICKER_WEEKDAY_ORDER.indexOf(d)).sort((a, b) => a - b);
    const contiguous = positions.every((p, i) => i === 0 || p === positions[i - 1] + 1);
    if (contiguous && positions.length >= 3) {
      return t(PICKER_WEEKDAY_KEYS[PICKER_WEEKDAY_ORDER[positions[0]]]) + '-' + t(PICKER_WEEKDAY_KEYS[PICKER_WEEKDAY_ORDER[positions[positions.length - 1]]]);
    }
    return positions.map((p) => t(PICKER_WEEKDAY_KEYS[PICKER_WEEKDAY_ORDER[p]])).join(', ');
  }

  function formatPickerSchedule(picker) {
    const times = (picker.times || []).slice().sort();
    const shown = times.slice(0, 3).join(', ');
    const timeText = times.length > 3 ? shown + ' +' + (times.length - 3) : shown;
    const dayText = formatPickerWeekdays(picker.weekdays);
    return [timeText, dayText].filter(Boolean).join(' · ');
  }

  function generatePickerId() {
    const used = new Set((pickers || []).map((p) => p && p.id));
    let ts = Date.now();
    while (used.has('picker-' + ts)) ts += 1;
    return 'picker-' + ts;
  }

  function generatePickerItemId(items) {
    const used = new Set((items || []).map((it) => it && it.id));
    let ts = Date.now();
    while (used.has('item-' + ts)) ts += 1;
    return 'item-' + ts;
  }

  // ---------- storage ----------
  async function loadState() {
    try {
      const r = await P().storage.get(['pickers', 'serverPickers', 'serverPickerPrefs', 'pickersAvailable']);
      pickers = Array.isArray(r.pickers) ? r.pickers : [];
      serverPickers = Array.isArray(r.serverPickers) ? r.serverPickers : [];
      serverPickerPrefs = (r.serverPickerPrefs && typeof r.serverPickerPrefs === 'object') ? r.serverPickerPrefs : {};
      pickersAvailable = r.pickersAvailable !== false;
    } catch (e) {
      pickers = []; serverPickers = []; serverPickerPrefs = {}; pickersAvailable = true;
    }
  }

  async function rebuildSchedule() {
    if (window.Scheduler && typeof window.Scheduler.rebuild === 'function') {
      try { await window.Scheduler.rebuild(); } catch (e) { console.error('[UIPickers] Scheduler.rebuild', e); }
    }
  }

  async function persistPickers() {
    selfWriting = true;
    try { await P().storage.set({ pickers }); } finally { selfWriting = false; }
    await rebuildSchedule();
  }

  // Preview: Scheduler.previewPicker(pickerOrId) -> shows IMMEDIATELY (it does not go through the queue, §18)
  function runPreview(pickerOrId) {
    const S = window.Scheduler;
    if (!S || typeof S.previewPicker !== 'function') { toast(t('previewError'), 'error'); return; }
    Promise.resolve()
      .then(() => S.previewPicker(pickerOrId))
      .then((res) => {
        if (res === false) { toast(t('previewError'), 'error'); return; }
        if (res && res.success === false) {
          toast(res.error === 'no_items' ? t('pickerNeedsItems') : t('previewError'), 'error');
          return;
        }
        toast(t('previewSent'), 'success');
      })
      .catch((e) => { console.error('[UIPickers] preview', e); toast(t('previewError'), 'error'); });
  }

  // ---------- list ----------
  function renderPickers() {
    const container = $('pickersList');
    const emptyState = $('emptyPickers');
    if (!container || !emptyState) return;

    const notice = $('pickersUnavailable');
    const addBtn = $('addPickerBtn');
    if (!pickersAvailable) {
      // §21: only the notice card is left; the data stays untouched in storage and reappears as soon as the server says true
      if (notice) notice.style.display = 'block';
      if (addBtn) addBtn.style.display = 'none';
      const section = $('serverPickersSection');
      if (section) section.style.display = 'none';
      container.textContent = '';
      container.style.display = 'none';
      emptyState.style.display = 'none';
      const modal = $('pickerModal');
      if (modal && modal.classList.contains('active')) closePickerModal();
      return;
    }
    if (notice) notice.style.display = 'none';
    if (addBtn) addBtn.style.display = '';

    renderServerPickers();
    container.textContent = '';

    if (!Array.isArray(pickers) || pickers.length === 0) {
      container.style.display = 'none';
      // If there are still Reminder sets, do not show the empty state
      emptyState.style.display = hasServerPickers() ? 'none' : 'block';
      return;
    }
    container.style.display = 'flex';
    emptyState.style.display = 'none';
    pickers.forEach((p) => container.appendChild(buildPickerCard(p)));
  }

  // ---------- picker sets from Reminder (server) - only on/off, changing times & preview ----------
  function hasServerPickers() { return Array.isArray(serverPickers) && serverPickers.length > 0; }

  // The user's preference for one server set: old form (boolean) or new form ({enabled, times}) - §14, both branches are kept
  function serverPickerPref(id) {
    const value = serverPickerPrefs ? serverPickerPrefs[id] : undefined;
    if (value === false) return { enabled: false, times: null };
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const times = Array.isArray(value.times) ? value.times.filter((x) => typeof x === 'string' && TIME_RE.test(x)) : [];
      return { enabled: value.enabled !== false, times: times.length ? times.slice().sort() : null };
    }
    return { enabled: true, times: null };
  }

  function serverPickerTimes(picker) {
    const pref = serverPickerPref(picker.id);
    return pref.times || (Array.isArray(picker.times) ? picker.times : []);
  }

  function serverPickerWithState(picker) {
    const pref = serverPickerPref(picker.id);
    return Object.assign({}, picker, { enabled: pref.enabled, times: serverPickerTimes(picker), fromServer: true });
  }

  function renderServerPickers() {
    const section = $('serverPickersSection');
    const list = $('serverPickersList');
    if (!section || !list) return;
    list.textContent = '';
    if (!hasServerPickers()) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    serverPickers.forEach((p) => list.appendChild(buildServerPickerCard(p)));
  }

  // Write the preference (on/off + times). `times = null` -> fall back to the default times
  async function saveServerPickerPref(id, patch) {
    let prefs = {};
    try {
      const store = await P().storage.get(['serverPickerPrefs']);
      prefs = (store.serverPickerPrefs && typeof store.serverPickerPrefs === 'object') ? store.serverPickerPrefs : {};
    } catch (e) { prefs = {}; }
    const current = serverPickerPref(id);
    const next = {
      enabled: patch.enabled === undefined ? current.enabled : !!patch.enabled,
      times: patch.times === undefined ? current.times : patch.times
    };
    if (next.times && next.times.length) prefs[id] = { enabled: next.enabled, times: next.times };
    else if (next.enabled) delete prefs[id];
    else prefs[id] = { enabled: false };
    serverPickerPrefs = prefs;
    selfWriting = true;
    try { await P().storage.set({ serverPickerPrefs: prefs }); } finally { selfWriting = false; }
    await rebuildSchedule();
  }

  /**
   * Does this server set share a time with an enabled local set? A clash means two popups that
   * lunchtime, 15 seconds apart, so the card says so and the user can switch one of them off.
   */
  function serverPickerClashTime(picker) {
    const mine = serverPickerTimes(picker);
    if (!mine.length) return '';
    for (const p of (Array.isArray(pickers) ? pickers : [])) {
      if (!p || typeof p !== 'object' || p.enabled === false) continue;
      if (!Array.isArray(p.items) || p.items.length === 0) continue;
      const hit = (Array.isArray(p.times) ? p.times : []).find((x) => mine.includes(x));
      if (hit) return hit;
    }
    return '';
  }

  function buildServerPickerCard(picker) {
    const pref = serverPickerPref(picker.id);
    const items = Array.isArray(picker.items) ? picker.items : [];
    const clash = pref.enabled ? serverPickerClashTime(picker) : '';
    return buildPickerCardShell({
      id: picker.id,
      icon: picker.icon || '🍽️',
      name: picker.name || '',
      badge: t('serverPickerBadge'),
      badgeTitle: t('serverPickerBadgeTitle'),
      schedule: formatPickerSchedule(serverPickerWithState(picker)),
      scheduleNote: [
        pref.times ? t('serverPickerCustomTime') : '',
        clash ? t('serverPickerClash').replace('{time}', clash) : ''
      ].filter(Boolean).join(' · '),
      enabled: pref.enabled,
      tags: [
        { text: '🍽️ ' + items.length, title: t('pickerItems') },
        { text: '⏱️ ' + (picker.displayMinutes || 1) + 'm', title: t('displayDuration') }
      ],
      actions: [
        { emoji: '👁️', title: t('preview'), className: 'btn-preview-picker pk-btn-preview', onClick: () => previewServerPicker(picker.id) },
        { emoji: '🕒', title: t('serverPickerEditTime'), className: 'btn-edit-reminder pk-btn-time', onClick: () => openServerPickerTimeModal(picker) }
      ],
      onToggle: async (input, card) => {
        await saveServerPickerPref(picker.id, { enabled: input.checked });
        card.classList.toggle('pk-off', !input.checked);
      }
    });
  }

  // Modal for changing the times of a server set (§14, §16): use exactly the .modal.active > .modal-backdrop + .modal-dialog structure,
  // with the footer INSIDE .modal-body (§18).
  function openServerPickerTimeModal(picker) {
    const pref = serverPickerPref(picker.id);
    let times = (pref.times || picker.times || []).slice();
    const defaults = (Array.isArray(picker.times) ? picker.times : []).slice();

    const overlay = el('div', 'modal active pk-time-modal');
    const backdrop = el('div', 'modal-backdrop');
    overlay.appendChild(backdrop);

    const dialog = el('div', 'modal-dialog pk-time-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const head = el('div', 'modal-header');
    head.appendChild(el('h2', '', t('serverPickerTimeTitle')));
    const closeBtn = el('button', 'modal-close', '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', t('close'));
    closeBtn.title = t('close');
    head.appendChild(closeBtn);
    dialog.appendChild(head);

    const body = el('div', 'modal-body');
    const summary = el('div', 'pk-time-summary');
    summary.appendChild(el('span', 'pk-time-summary-icon', picker.icon || '🍽️'));
    const summaryText = el('div', 'pk-time-summary-text');
    summaryText.appendChild(el('div', 'pk-time-summary-name', picker.name || ''));
    summaryText.appendChild(el('div', 'form-hint', t('serverPickerTimeHint')));
    summary.appendChild(summaryText);
    body.appendChild(summary);

    const group = el('div', 'form-group');
    group.appendChild(el('label', '', t('pickerTimes')));
    const list = el('div', 'pk-time-list');
    group.appendChild(list);

    const addRow = el('div', 'pk-add-time');
    const timeInput = document.createElement('input');
    timeInput.type = 'time';
    timeInput.step = '60';
    timeInput.className = 'pk-time-input';
    timeInput.value = defaults[0] || '';
    timeInput.setAttribute('aria-label', t('pickerTimes'));
    const addBtn = el('button', 'btn btn-sm btn-secondary');
    addBtn.type = 'button';
    addBtn.appendChild(document.createTextNode('+ '));
    addBtn.appendChild(el('span', '', t('addTime')));
    addRow.appendChild(timeInput);
    addRow.appendChild(addBtn);
    group.appendChild(addRow);

    const errorEl = el('div', 'pk-error');
    errorEl.setAttribute('role', 'alert');
    group.appendChild(errorEl);
    body.appendChild(group);

    const footer = el('div', 'modal-footer');
    const resetBtn = el('button', 'btn btn-secondary');
    resetBtn.type = 'button';
    resetBtn.appendChild(document.createTextNode('↺ '));
    resetBtn.appendChild(el('span', '', t('serverPickerTimeReset')));
    const saveBtn = el('button', 'btn btn-primary');
    saveBtn.type = 'button';
    saveBtn.appendChild(document.createTextNode('✓ '));
    saveBtn.appendChild(el('span', '', t('save')));
    footer.appendChild(resetBtn);
    footer.appendChild(saveBtn);
    body.appendChild(footer);
    dialog.appendChild(body);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    setTimeout(() => timeInput.focus(), 60);

    function setError(msg) { errorEl.textContent = msg || ''; }
    function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    function paint() {
      list.textContent = '';
      if (!times.length) { list.appendChild(el('span', 'form-hint', t('pickerErrorNoTime'))); return; }
      times.slice().sort().forEach((value) => {
        const chip = el('span', 'pk-time-chip');
        chip.appendChild(el('span', '', value));
        const remove = el('button', 'pk-chip-remove', '×');
        remove.type = 'button';
        remove.title = t('delete');
        remove.setAttribute('aria-label', t('delete') + ' ' + value);
        remove.addEventListener('click', () => { times = times.filter((x) => x !== value); setError(''); paint(); });
        chip.appendChild(remove);
        list.appendChild(chip);
      });
    }

    function addTime() {
      const value = String(timeInput.value || '').trim();
      if (!TIME_RE.test(value)) { setError(t('pickerErrorTimeFormat')); timeInput.focus(); return; }
      if (times.indexOf(value) >= 0) { setError(t('pickerErrorTimeDuplicate')); return; }
      if (times.length >= PICKER_LIMITS.maxTimes) { setError(t('pickerErrorMaxTimes')); return; }
      times = times.concat([value]).sort();
      setError('');
      paint();
    }

    addBtn.addEventListener('click', addTime);
    timeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTime(); } });
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target === backdrop) close(); });
    resetBtn.addEventListener('click', async () => {
      await saveServerPickerPref(picker.id, { times: null });
      close();
      renderPickers();
      toast(t('serverPickerTimeReset'), 'success');
    });
    saveBtn.addEventListener('click', async () => {
      if (!times.length) { setError(t('pickerErrorNoTime')); return; }
      const sorted = times.slice().sort();
      // Custom times identical to the defaults -> do not store them (so the schedule is not frozen if the admin changes the times later)
      const same = defaults.length === sorted.length && defaults.slice().sort().every((v, i) => v === sorted[i]);
      await saveServerPickerPref(picker.id, { times: same ? null : sorted });
      close();
      renderPickers();
      toast(t('pickerSaved'), 'success');
    });
    paint();
  }

  function previewServerPicker(id) {
    const picker = (serverPickers || []).find((p) => p && p.id === id);
    if (!picker) return;
    if (!(picker.items || []).length) { toast(t('pickerNeedsItems'), 'error'); return; }
    runPreview(serverPickerWithState(picker));
  }

  // A picker card uses EXACTLY the reminder card structure (.reminder-card) - §17
  function buildPickerCardShell(options) {
    const card = el('div', 'reminder-card pk-card' + (options.enabled ? '' : ' pk-off'));
    if (options.id) card.dataset.id = options.id;

    const header = el('div', 'reminder-header');
    header.appendChild(el('div', 'reminder-icon', options.icon || '🍽️'));

    const content = el('div', 'reminder-content');
    const nameRow = el('div', 'pk-name-row');
    nameRow.appendChild(el('div', 'reminder-message', options.name || ''));
    if (options.badge) {
      const badge = el('span', 'reminder-tag pk-source-tag', options.badge);
      if (options.badgeTitle) badge.title = options.badgeTitle;
      nameRow.appendChild(badge);
    }
    content.appendChild(nameRow);
    const schedule = el('div', 'reminder-time-detail', options.schedule || '');
    if (options.scheduleNote) schedule.appendChild(el('span', 'pk-card-custom', ' · ' + options.scheduleNote));
    content.appendChild(schedule);
    header.appendChild(content);

    const toggle = el('label', 'toggle reminder-toggle pk-toggle');
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = !!options.enabled;
    toggleInput.setAttribute('aria-label', t('pickerEnabledAria'));
    toggleInput.title = t('pickerEnabledAria');
    toggle.appendChild(toggleInput);
    toggle.appendChild(el('span', 'toggle-slider'));
    toggleInput.addEventListener('change', () => options.onToggle(toggleInput, card));
    header.appendChild(toggle);
    card.appendChild(header);

    const footer = el('div', 'reminder-footer');
    const meta = el('div', 'reminder-meta');
    (options.tags || []).forEach((tag) => {
      const node = el('span', 'reminder-tag', tag.text);
      if (tag.title) node.title = tag.title;
      meta.appendChild(node);
    });
    footer.appendChild(meta);

    const actions = el('div', 'reminder-actions');
    (options.actions || []).forEach((action) => {
      const btn = el('button', 'btn-icon-sm ' + (action.className || ''), action.emoji);
      btn.type = 'button';
      btn.title = action.title;
      btn.setAttribute('aria-label', action.title);
      btn.addEventListener('click', (e) => { e.stopPropagation(); action.onClick(); });
      actions.appendChild(btn);
    });
    footer.appendChild(actions);
    card.appendChild(footer);
    return card;
  }

  function buildPickerCard(picker) {
    const items = Array.isArray(picker.items) ? picker.items : [];
    return buildPickerCardShell({
      id: picker.id,
      icon: picker.icon || '🍽️',
      name: picker.name || '',
      schedule: formatPickerSchedule(picker),
      enabled: picker.enabled !== false,
      tags: [
        { text: '🍽️ ' + items.length, title: t('pickerItems') },
        { text: '⏱️ ' + (picker.displayMinutes || 1) + 'm', title: t('displayDuration') }
      ],
      actions: [
        { emoji: '👁️', title: t('preview'), className: 'btn-preview-picker pk-btn-preview', onClick: () => previewPickerById(picker.id) },
        { emoji: '✏️', title: t('edit'), className: 'btn-edit-reminder pk-btn-edit', onClick: () => openPickerModal(pickers.find((p) => p.id === picker.id) || null) },
        {
          emoji: '🗑️', title: t('delete'), className: 'btn-delete-reminder pk-btn-delete',
          onClick: async () => {
            if (!(await A().showConfirm(t('confirmDeletePicker')))) return;
            pickers = pickers.filter((p) => p.id !== picker.id);
            await persistPickers();
            renderPickers();
            toast(t('pickerDeleted'), 'success');
          }
        }
      ],
      onToggle: async (input, card) => {
        const target = pickers.find((p) => p.id === picker.id);
        if (!target) return;
        target.enabled = input.checked;
        await persistPickers();
        card.classList.toggle('pk-off', !input.checked);
      }
    });
  }

  function previewPickerById(pickerId) {
    const picker = pickers.find((p) => p.id === pickerId);
    if (!picker || !(picker.items || []).length) { toast(t('pickerNeedsItems'), 'error'); return; }
    runPreview(pickerId);
  }

  async function createVietnamesePickerSample() {
    if (pickers.length >= PICKER_LIMITS.maxPickers) { toast(t('pickerErrorMaxSets'), 'error'); return; }
    const ts = Date.now();
    const items = PICKER_VIETNAMESE_SAMPLE.map((food, i) => ({
      id: 'item-' + (ts + i),
      name: food.name,
      emoji: food.emoji,
      image: food.image || '',
      imageCredit: food.imageCredit || '',
      imageSource: food.imageSource || ''
    }));
    const record = buildPickerRecord({
      id: generatePickerId(),
      name: t('pickerSampleName'),
      icon: '🍜',
      enabled: true,
      times: ['11:30'],
      weekdays: [1, 2, 3, 4, 5, 6],
      displayMinutes: 1,
      items
    });
    pickers = pickers.concat([record]);
    await persistPickers();
    renderPickers();
    toast(t('pickerSampleAdded'), 'success');
  }

  // ---------- modal ----------
  function setPickerError(field, key) {
    const node = $('picker' + field + 'Error');
    if (node) node.textContent = key ? t(key) : '';
  }

  function clearPickerErrors() {
    ['Name', 'Icon', 'Times', 'Weekdays', 'Duration', 'Item'].forEach((f) => setPickerError(f, ''));
  }

  function openPickerModal(picker) {
    picker = picker || null;
    const modal = $('pickerModal');
    if (!modal) return;
    if (!picker && pickers.length >= PICKER_LIMITS.maxPickers) { toast(t('pickerErrorMaxSets'), 'error'); return; }

    _pkDraft = picker
      ? {
          id: picker.id,
          name: picker.name || '',
          icon: picker.icon || '🍽️',
          enabled: picker.enabled !== false,
          times: (picker.times || []).slice(),
          weekdays: (picker.weekdays || []).slice(),
          displayMinutes: picker.displayMinutes || 1,
          items: (picker.items || []).map((it) => ({
            id: it.id, name: it.name, emoji: it.emoji || '', image: it.image || '',
            imageCredit: it.imageCredit || '', imageSource: it.imageSource || '',
            priceMin: pickerPrice(it.priceMin), priceMax: pickerPrice(it.priceMax)
          })),
          lastPickedId: picker.lastPickedId
        }
      : {
          id: generatePickerId(),
          name: '',
          icon: '🍽️',
          enabled: true,
          times: ['11:30'],
          weekdays: [1, 2, 3, 4, 5, 6],
          displayMinutes: 1,
          items: []
        };

    $('pickerModalTitle').textContent = t(picker ? 'editPickerTitle' : 'addPickerTitle');
    $('pickerId').value = _pkDraft.id;
    $('pickerName').value = _pkDraft.name;
    $('pickerIcon').value = _pkDraft.icon;
    $('pickerIconPreview').value = _pkDraft.icon;
    $('pickerDisplayDuration').value = _pkDraft.displayMinutes;

    document.querySelectorAll('#pickerIconPicker .icon-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.icon === _pkDraft.icon));
    document.querySelectorAll('#pickerWeekdays .weekday-btn').forEach((btn) => btn.classList.toggle('active', _pkDraft.weekdays.includes(parseInt(btn.dataset.day, 10))));
    const durationValue = String(_pkDraft.displayMinutes);
    document.querySelectorAll('#pickerDurationPresets .preset-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.value === durationValue));

    clearPickerErrors();
    renderPickerTimes();
    renderPickerItems();
    resetPickerItemEditor();
    updatePickerSizeWarning();
    modal.classList.add('active');
  }

  function closePickerModal() {
    const modal = $('pickerModal');
    if (modal) modal.classList.remove('active');
    _pkDraft = null;
    resetPickerItemEditor();
  }

  function renderPickerTimes() {
    const list = $('pickerTimesList');
    if (!list || !_pkDraft) return;
    list.textContent = '';
    _pkDraft.times.slice().sort().forEach((time) => {
      const chip = el('span', 'pk-time-chip');
      chip.appendChild(el('span', '', time));
      const remove = el('button', 'pk-chip-remove', '×');
      remove.type = 'button';
      remove.title = t('delete');
      remove.setAttribute('aria-label', t('delete') + ' ' + time);
      remove.addEventListener('click', () => {
        _pkDraft.times = _pkDraft.times.filter((x) => x !== time);
        renderPickerTimes();
        setPickerError('Times', '');
      });
      chip.appendChild(remove);
      list.appendChild(chip);
    });
  }

  function addPickerTime() {
    if (!_pkDraft) return;
    const input = $('pickerTimeInput');
    const value = input ? input.value : '';
    if (!isPickerTime(value)) { setPickerError('Times', 'pickerErrorTimeFormat'); return; }
    if (_pkDraft.times.includes(value)) { setPickerError('Times', 'pickerErrorTimeDuplicate'); return; }
    if (_pkDraft.times.length >= PICKER_LIMITS.maxTimes) { setPickerError('Times', 'pickerErrorMaxTimes'); return; }
    _pkDraft.times.push(value);
    _pkDraft.times.sort();
    setPickerError('Times', '');
    renderPickerTimes();
  }

  function renderPickerItems() {
    const list = $('pickerItemsList');
    const emptyHint = $('pickerItemsEmpty');
    const counter = $('pickerItemsCount');
    if (!list || !_pkDraft) return;
    list.textContent = '';
    if (counter) counter.textContent = _pkDraft.items.length + '/' + PICKER_LIMITS.maxItems;
    if (emptyHint) emptyHint.style.display = _pkDraft.items.length ? 'none' : 'block';

    _pkDraft.items.forEach((item) => {
      const row = el('div', 'pk-item-row' + (item.id === _pkEditingItemId ? ' pk-item-active' : ''));
      row.dataset.id = item.id;
      row.appendChild(buildPickerThumb(item));

      const label = el('span', 'pk-item-label');
      const nameLine = el('span', 'pk-item-name', item.name);
      nameLine.title = item.name;
      label.appendChild(nameLine);
      // §10.1: CC BY / CC BY-SA images must be credited -> a small line under the item name
      const credit = normalizePickerCredit(item.imageCredit);
      if (credit && item.image) {
        const creditLine = el('span', 'pk-item-credit', credit);
        creditLine.title = credit;
        label.appendChild(creditLine);
      }
      row.appendChild(label);

      const editBtn = createPickerActionButton('edit', 'edit', 'pk-btn-edit');
      editBtn.addEventListener('click', () => loadPickerItemIntoEditor(item.id));
      row.appendChild(editBtn);

      const removeBtn = createPickerActionButton('delete', 'delete', 'pk-btn-delete');
      removeBtn.addEventListener('click', async () => {
        if (!(await A().showConfirm(t('confirmDeletePickerItem')))) return;
        _pkDraft.items = _pkDraft.items.filter((x) => x.id !== item.id);
        if (_pkEditingItemId === item.id) resetPickerItemEditor();
        renderPickerItems();
        updatePickerSizeWarning();
      });
      row.appendChild(removeBtn);
      list.appendChild(row);
    });
  }

  // Safe thumbnail: https/data:image only, falls back to the emoji if loading fails
  function buildPickerThumb(item) {
    const thumb = el('span', 'pk-item-thumb');
    const fallback = (item && item.emoji) ? item.emoji : '🍽️';
    const src = pickerSafeImageSrc(item && item.image);
    if (src) {
      const img = document.createElement('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => { img.remove(); thumb.textContent = fallback; });
      img.src = src;
      thumb.appendChild(img);
    } else {
      thumb.textContent = fallback;
    }
    return thumb;
  }

  function resetPickerItemEditor() {
    _pkEditingItemId = null;
    _pkItemImage = '';
    _pkItemImageCredit = '';
    _pkItemImageSource = '';
    closePickerImageSearch();
    const nameEl = $('pickerItemName');
    const emojiEl = $('pickerItemEmoji');
    const imageEl = $('pickerItemImage');
    const fileEl = $('pickerItemFile');
    const saveBtn = $('pickerItemSaveBtn');
    if (nameEl) nameEl.value = '';
    if (emojiEl) emojiEl.value = '';
    if (imageEl) imageEl.value = '';
    if (fileEl) fileEl.value = '';
    if (saveBtn) saveBtn.textContent = t('addItem');
    setPickerError('Item', '');
    renderPickerItemThumb();
    renderPickerItemCredit();
  }

  function renderPickerItemThumb() {
    const holder = $('pickerItemThumb');
    if (!holder) return;
    holder.textContent = '';
    const emojiEl = $('pickerItemEmoji');
    const emoji = emojiEl ? emojiEl.value.trim() : '';
    const preview = buildPickerThumb({ emoji, image: _pkItemImage });
    if (preview.firstChild) { while (preview.firstChild) holder.appendChild(preview.firstChild); }
    else holder.textContent = preview.textContent;
  }

  function renderPickerItemCredit() {
    const line = $('pickerItemCreditLine');
    if (!line) return;
    line.textContent = '';
    const credit = normalizePickerCredit(_pkItemImageCredit);
    if (!credit || !_pkItemImage) { line.hidden = true; return; }
    line.hidden = false;
    line.appendChild(el('span', '', t('pickerImageCredit') + ': '));
    const source = normalizePickerSource(_pkItemImageSource);
    if (source) {
      const a = document.createElement('a');
      a.href = source;                    // an https link -> app.js intercepts the click and opens it in the system browser
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = credit;
      a.title = credit;
      line.appendChild(a);
    } else {
      const span = el('span', '', credit);
      span.title = credit;
      line.appendChild(span);
    }
  }

  function loadPickerItemIntoEditor(itemId) {
    if (!_pkDraft) return;
    const item = _pkDraft.items.find((x) => x.id === itemId);
    if (!item) return;
    _pkEditingItemId = itemId;
    _pkItemImage = item.image || '';
    _pkItemImageCredit = item.imageCredit || '';
    _pkItemImageSource = item.imageSource || '';
    closePickerImageSearch();
    $('pickerItemName').value = item.name || '';
    $('pickerItemEmoji').value = item.emoji || '';
    // The URL field only shows https links; uploaded images (data:) stay in memory and in the thumbnail
    $('pickerItemImage').value = /^https:/i.test(_pkItemImage) ? _pkItemImage : '';
    const saveBtn = $('pickerItemSaveBtn');
    if (saveBtn) saveBtn.textContent = t('updateItem');
    setPickerError('Item', '');
    renderPickerItemThumb();
    renderPickerItemCredit();
    renderPickerItems();
  }

  function commitPickerItem() {
    if (!_pkDraft) return;
    const name = ($('pickerItemName').value || '').trim();
    const emoji = ($('pickerItemEmoji').value || '').trim();
    if (!name || name.length > PICKER_LIMITS.itemNameMax) { setPickerError('Item', 'pickerErrorItemName'); return; }
    if (Array.from(emoji).length > PICKER_LIMITS.itemEmojiMax) { setPickerError('Item', 'pickerErrorItemEmoji'); return; }
    const imageResult = normalizePickerImage(_pkItemImage);
    if (!imageResult.ok) { setPickerError('Item', imageResult.error); return; }

    if (_pkEditingItemId) {
      const item = _pkDraft.items.find((x) => x.id === _pkEditingItemId);
      if (item) {
        item.name = name;
        item.emoji = emoji;
        item.image = imageResult.value;
        item.imageCredit = imageResult.value ? normalizePickerCredit(_pkItemImageCredit) : '';
        item.imageSource = imageResult.value ? normalizePickerSource(_pkItemImageSource) : '';
      }
    } else {
      if (_pkDraft.items.length >= PICKER_LIMITS.maxItems) { setPickerError('Item', 'pickerErrorMaxItems'); return; }
      _pkDraft.items.push({
        id: generatePickerItemId(_pkDraft.items),
        name, emoji,
        image: imageResult.value,
        imageCredit: imageResult.value ? normalizePickerCredit(_pkItemImageCredit) : '',
        imageSource: imageResult.value ? normalizePickerSource(_pkItemImageSource) : '',
        priceMin: 0,
        priceMax: 0
      });
    }
    resetPickerItemEditor();
    renderPickerItems();
    updatePickerSizeWarning();
  }

  // Resize the image down to <=256x256, JPEG q=0.75; reject it if the data URL exceeds 200 KB
  function resizePickerImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error('pickerErrorImageRead')); return; }
      if (!/^image\/(png|jpe?g|webp)$/i.test(file.type || '')) { reject(new Error('pickerErrorImageType')); return; }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('pickerErrorImageRead'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('pickerErrorImageRead'));
        img.onload = () => {
          const maxSide = 256;
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (!w || !h) { reject(new Error('pickerErrorImageRead')); return; }
          const scale = Math.min(1, maxSide / Math.max(w, h));
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('pickerErrorImageRead')); return; }
          ctx.fillStyle = '#ffffff';   // JPEG has no alpha channel
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          let dataUrl;
          try { dataUrl = canvas.toDataURL('image/jpeg', 0.75); } catch (e) { reject(new Error('pickerErrorImageRead')); return; }
          if (!/^data:image\/jpeg;base64,/.test(dataUrl)) { reject(new Error('pickerErrorImageRead')); return; }
          if (dataUrl.length > PICKER_LIMITS.imageDataMax) { reject(new Error('pickerErrorImageTooLarge')); return; }
          resolve(dataUrl);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handlePickerImageUpload(file) {
    try {
      const dataUrl = await resizePickerImageFile(file);
      _pkItemImage = dataUrl;
      _pkItemImageCredit = '';
      _pkItemImageSource = '';
      const imageEl = $('pickerItemImage');
      if (imageEl) imageEl.value = '';
      setPickerError('Item', '');
      renderPickerItemThumb();
      renderPickerItemCredit();
    } catch (err) {
      const key = (err && typeof err.message === 'string' && err.message.indexOf('picker') === 0) ? err.message : 'pickerErrorImageRead';
      setPickerError('Item', key);
    }
  }

  // ---------- image search on Wikimedia Commons (§10.3) - only called when the user CLICKS ----------
  function buildCommonsSearchUrl(query) {
    const params = [
      'action=query',
      'format=json',
      'origin=*',
      'generator=search',
      'gsrsearch=' + encodeURIComponent(String(query || '').trim() + ' filetype:bitmap'),
      'gsrnamespace=6',
      'gsrlimit=' + PICKER_LIMITS.imageResults,
      'prop=imageinfo',
      'iiprop=' + encodeURIComponent('url|extmetadata'),
      'iiurlwidth=400'
    ];
    return PICKER_COMMONS_API + '?' + params.join('&');
  }

  // extmetadata returns HTML - strip the tags and decode a few basic entities (without using innerHTML)
  function stripCommonsHtml(value) {
    if (typeof value !== 'string') return '';
    const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#039': "'", '#38': '&' };
    return value
      .replace(/<[^>]*>/g, ' ')
      .replace(/&(#0?39|#38|amp|lt|gt|quot|apos|nbsp);/gi, (m, name) => entities[String(name).toLowerCase()] || ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function formatCommonsCredit(artist, license) {
    const a = stripCommonsHtml(artist);
    const l = stripCommonsHtml(license);
    if (a && l) return normalizePickerCredit(a + ' · ' + l);
    return normalizePickerCredit(a || l || '');
  }

  function cleanCommonsImageUrl(url) {
    if (typeof url !== 'string') return '';
    return url.split('?')[0];
  }

  function parseCommonsResults(json) {
    const pages = (json && json.query && json.query.pages) ? json.query.pages : null;
    if (!pages || typeof pages !== 'object') return [];
    const list = Object.keys(pages).map((k) => pages[k]).filter(Boolean);
    list.sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0));
    const out = [];
    for (const page of list) {
      const info = (Array.isArray(page.imageinfo) ? page.imageinfo[0] : null) || null;
      if (!info) continue;
      const image = cleanCommonsImageUrl(info.thumburl || info.url);
      if (!normalizePickerImage(image).ok || !/^https:\/\//i.test(image)) continue;
      const meta = info.extmetadata || {};
      out.push({
        title: stripCommonsHtml(page.title || '').replace(/^File:/i, ''),
        image,
        credit: formatCommonsCredit(meta.Artist && meta.Artist.value, meta.LicenseShortName && meta.LicenseShortName.value),
        source: normalizePickerSource(info.descriptionurl || '')
      });
      if (out.length >= PICKER_LIMITS.imageResults) break;
    }
    return out;
  }

  function setPickerImageStatus(key, kind) {
    const node = $('pickerImageStatus');
    if (!node) return;
    node.className = 'pk-image-status' + (kind ? ' pk-image-status-' + kind : '');
    node.textContent = key ? t(key) : '';
    node.hidden = !key;
  }

  function renderPickerImageSkeletons() {
    const grid = $('pickerImageGrid');
    if (!grid) return;
    grid.textContent = '';
    for (let i = 0; i < PICKER_LIMITS.imageResults; i++) grid.appendChild(el('div', 'pk-image-skeleton'));
  }

  function openPickerImageSearch() {
    const panel = $('pickerImageSearch');
    const input = $('pickerImageQuery');
    if (!panel) return;
    panel.hidden = false;
    const nameEl = $('pickerItemName');
    const name = nameEl ? nameEl.value.trim() : '';
    if (input && !input.value.trim() && name) input.value = name;
    searchPickerImages();
    if (input) { try { input.focus(); } catch (e) { /* ignore */ } }
  }

  function closePickerImageSearch() {
    const panel = $('pickerImageSearch');
    if (!panel) return;
    panel.hidden = true;
    _pkImageSearchToken++;
    const grid = $('pickerImageGrid');
    if (grid) grid.textContent = '';
    setPickerImageStatus('', '');
  }

  async function searchPickerImages() {
    const input = $('pickerImageQuery');
    const grid = $('pickerImageGrid');
    if (!grid) return;
    const query = input ? input.value.trim() : '';
    if (!query) { grid.textContent = ''; setPickerImageStatus('pickerImageNeedQuery', 'error'); return; }

    const token = ++_pkImageSearchToken;
    setPickerImageStatus('pickerImageLoading', 'loading');
    renderPickerImageSkeletons();

    let results;
    try {
      const response = await fetch(buildCommonsSearchUrl(query), { credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      results = parseCommonsResults(await response.json());
    } catch (e) {
      if (token !== _pkImageSearchToken) return;
      grid.textContent = '';
      setPickerImageStatus('pickerImageError', 'error');
      return;
    }
    if (token !== _pkImageSearchToken) return;
    grid.textContent = '';
    if (!results.length) { setPickerImageStatus('pickerImageEmpty', 'empty'); return; }
    setPickerImageStatus('', '');
    results.forEach((r) => grid.appendChild(buildPickerImageCell(r)));
  }

  function buildPickerImageCell(result) {
    const cell = el('button', 'pk-image-cell');
    cell.type = 'button';
    cell.title = result.title + (result.credit ? ' - ' + result.credit : '');
    cell.setAttribute('aria-label', t('pickerImageUseThis') + ': ' + result.title);
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => { cell.classList.add('pk-image-cell-broken'); });
    img.src = result.image;
    cell.appendChild(img);
    cell.appendChild(el('span', 'pk-image-cell-credit', result.credit || t('pickerImageNoCredit')));
    cell.addEventListener('click', () => choosePickerImage(result));
    return cell;
  }

  function choosePickerImage(result) {
    const check = normalizePickerImage(result.image);
    if (!check.ok) { setPickerImageStatus('pickerImageError', 'error'); return; }
    _pkItemImage = check.value;
    _pkItemImageCredit = normalizePickerCredit(result.credit);
    _pkItemImageSource = normalizePickerSource(result.source);
    const imageEl = $('pickerItemImage');
    if (imageEl) imageEl.value = _pkItemImage;
    const fileEl = $('pickerItemFile');
    if (fileEl) fileEl.value = '';
    setPickerError('Item', '');
    closePickerImageSearch();
    renderPickerItemThumb();
    renderPickerItemCredit();
    toast(t('pickerImagePicked'), 'success');
  }

  function updatePickerSizeWarning() {
    const box = $('pickerSizeWarning');
    if (!box) return;
    if (!_pkDraft) { box.style.display = 'none'; return; }
    const others = pickers.filter((p) => p.id !== _pkDraft.id);
    const bytes = estimatePickersBytes(others.concat([_pkDraft]));
    if (bytes > PICKER_LIMITS.warnBytes) { box.textContent = t('pickerSizeWarning'); box.style.display = 'block'; }
    else { box.textContent = ''; box.style.display = 'none'; }
  }

  function collectPickerDraftFromForm() {
    if (!_pkDraft) return null;
    _pkDraft.name = ($('pickerName').value || '').trim();
    _pkDraft.icon = ($('pickerIconPreview').value || '').trim() || '🍽️';
    $('pickerIcon').value = _pkDraft.icon;
    _pkDraft.displayMinutes = parseInt($('pickerDisplayDuration').value, 10);
    _pkDraft.weekdays = Array.from(document.querySelectorAll('#pickerWeekdays .weekday-btn.active'))
      .map((btn) => parseInt(btn.dataset.day, 10))
      .filter((d) => Number.isInteger(d));
    return _pkDraft;
  }

  function showPickerErrors(errors) {
    errors.forEach((err) => {
      const field = err.field === 'items' ? 'Item' : (err.field.charAt(0).toUpperCase() + err.field.slice(1));
      setPickerError(field, err.key);
    });
    toast(t('pickerErrorFixFields'), 'error');
  }

  async function savePickerFromModal() {
    const draft = collectPickerDraftFromForm();
    if (!draft) return;
    clearPickerErrors();
    const errors = validatePickerDraft(draft);
    if (errors.length) { showPickerErrors(errors); return; }

    const record = buildPickerRecord(draft);
    const index = pickers.findIndex((p) => p.id === record.id);
    if (index === -1 && pickers.length >= PICKER_LIMITS.maxPickers) { toast(t('pickerErrorMaxSets'), 'error'); return; }
    const next = pickers.slice();
    if (index === -1) next.push(record); else next[index] = record;
    if (estimatePickersBytes(next) > PICKER_LIMITS.hardBytes) { toast(t('pickerErrorTooLarge'), 'error'); return; }

    pickers = next;
    await persistPickers();
    closePickerModal();
    renderPickers();
    toast(t('pickerSaved'), 'success');
  }

  function previewPickerFromModal() {
    const draft = collectPickerDraftFromForm();
    if (!draft) return;
    if (!draft.items.length) { toast(t('pickerNeedsItems'), 'error'); return; }
    clearPickerErrors();
    const errors = validatePickerDraft(draft);
    if (errors.length) { showPickerErrors(errors); return; }
    const record = buildPickerRecord(draft);
    // An unsaved draft -> send the object itself; already saved -> send the id (the Scheduler reads the latest version)
    const saved = pickers.some((p) => p.id === record.id);
    runPreview(saved ? record.id : record);
  }

  function setupPickerUI() {
    const addBtn = $('addPickerBtn');
    if (addBtn) addBtn.addEventListener('click', () => openPickerModal());
    const emptyAdd = $('emptyAddPicker');
    if (emptyAdd) emptyAdd.addEventListener('click', () => openPickerModal());
    const sampleBtn = $('pickerSampleBtn');
    if (sampleBtn) sampleBtn.addEventListener('click', () => { createVietnamesePickerSample().catch((e) => console.error(e)); });

    const modal = $('pickerModal');
    if (!modal) return;
    $('closePickerModal').addEventListener('click', closePickerModal);
    modal.querySelector('.modal-backdrop').addEventListener('click', closePickerModal);

    document.querySelectorAll('#pickerIconPicker .icon-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#pickerIconPicker .icon-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        $('pickerIcon').value = btn.dataset.icon;
        $('pickerIconPreview').value = btn.dataset.icon;
        if (_pkDraft) _pkDraft.icon = btn.dataset.icon;
        setPickerError('Icon', '');
      });
    });

    $('pickerIconPreview').addEventListener('input', (e) => {
      const value = e.target.value;
      $('pickerIcon').value = value;
      if (_pkDraft) _pkDraft.icon = value;
      document.querySelectorAll('#pickerIconPicker .icon-btn').forEach((b) => b.classList.toggle('active', b.dataset.icon === value));
      setPickerError('Icon', '');
    });

    $('pickerAddTimeBtn').addEventListener('click', addPickerTime);
    $('pickerTimeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addPickerTime(); } });

    $('pickerWeekdays').addEventListener('click', (e) => {
      const btn = e.target.closest('.weekday-btn');
      if (!btn) return;
      e.preventDefault();
      btn.classList.toggle('active');
      setPickerError('Weekdays', '');
    });

    document.querySelectorAll('#pickerDurationPresets .preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#pickerDurationPresets .preset-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        $('pickerDisplayDuration').value = btn.dataset.value;
        setPickerError('Duration', '');
      });
    });
    $('pickerDisplayDuration').addEventListener('input', (e) => {
      const value = e.target.value;
      document.querySelectorAll('#pickerDurationPresets .preset-btn').forEach((b) => b.classList.toggle('active', b.dataset.value === value));
      setPickerError('Duration', '');
    });

    $('pickerItemSaveBtn').addEventListener('click', commitPickerItem);
    $('pickerItemCancelBtn').addEventListener('click', () => { resetPickerItemEditor(); renderPickerItems(); });
    $('pickerItemName').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitPickerItem(); } });
    $('pickerItemEmoji').addEventListener('input', renderPickerItemThumb);
    $('pickerItemImage').addEventListener('input', (e) => {
      _pkItemImage = (e.target.value || '').trim();
      _pkItemImageCredit = '';   // a hand-typed URL is no longer a Commons result -> drop the old attribution
      _pkItemImageSource = '';
      setPickerError('Item', '');
      renderPickerItemThumb();
      renderPickerItemCredit();
    });
    $('pickerItemUploadBtn').addEventListener('click', () => $('pickerItemFile').click());
    $('pickerFindImageBtn').addEventListener('click', openPickerImageSearch);
    $('pickerImageSearchBtn').addEventListener('click', searchPickerImages);
    $('pickerImageSearchClose').addEventListener('click', closePickerImageSearch);
    $('pickerImageQuery').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchPickerImages(); } });
    $('pickerItemClearImageBtn').addEventListener('click', () => {
      _pkItemImage = '';
      _pkItemImageCredit = '';
      _pkItemImageSource = '';
      $('pickerItemImage').value = '';
      $('pickerItemFile').value = '';
      setPickerError('Item', '');
      renderPickerItemThumb();
      renderPickerItemCredit();
    });
    $('pickerItemFile').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handlePickerImageUpload(file);
    });

    $('pickerPreviewBtn').addEventListener('click', previewPickerFromModal);
    $('pickerForm').addEventListener('submit', async (e) => { e.preventDefault(); await savePickerFromModal(); });
  }

  // ---------- module API ----------
  async function render() {
    await loadState();
    renderPickers();
  }

  async function init() {
    if (initialized) return render();
    initialized = true;
    setupPickerUI();
    // serverPickers is written by VersionApi (every 30 minutes); pickers may be written by the Scheduler to store lastPickedId -> re-render
    P().storage.onChanged((changes) => {
      if (!changes || selfWriting) return;
      if (changes.serverPickers || changes.serverPickerPrefs || changes.pickers || changes.pickersAvailable) {
        render().catch((e) => console.error('[UIPickers] render', e));
      }
    });
    await render();
  }

  window.UIPickers = { init, render, openModal: openPickerModal, PICKER_LIMITS };
})();
