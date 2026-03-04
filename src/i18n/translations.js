// =============================================================================
// RSA Driver Pilot — Translations (EN / HI / AR / UR)
// Same 4 languages as original PWA app.
// =============================================================================

export const TRANSLATIONS = {
  en: {
    appTitle:          'RSA Driver App',
    appSubtitle:       'Shift Management',
    loading:           'Loading…',
    error:             'Error',
    retry:             'Retry',
    save:              'Save',
    cancel:            'Cancel',
    back:              'Back',
    submit:            'Submit',
    required:          'Required',
    optional:          'Optional',
    success:           'Success!',
    home:              'Home',

    // Language toggle
    langEn: 'EN', langHi: 'हिं', langAr: 'عر', langUr: 'اُر',

    // Login / Arrival screen
    loginTitle:        'Select Your Name',
    loginSubtitle:     'Search for your name to begin',
    driverSearchPlaceholder: 'Search driver name or ID…',
    arrivedAtFacility: 'Arrived at Facility',
    checkingLocation:  'Checking your location…',
    tooFarFromFacility:'You are {distance}m from the facility.\nMove closer to mark arrival.',
    locationError:     'Could not get your location. Please enable GPS.',
    withinGeofence:    'Location verified ✓',

    // Stage 1
    stage1Title:       'Start of Shift',
    stage1Sub:         'Complete your shift details',
    helperSection:     'Helper Details (Optional)',
    helperModeSearch:  'Search from list',
    helperModeManual:  'Enter manually',
    helperNameLabel:   'Helper Name',
    helperIdLabel:     'Helper Employee ID',
    helperCoLabel:     'Helper Company',
    vehicleLabel:      'Vehicle Number',
    startOdoLabel:     'Start Odometer (km)',
    startPhotoLabel:   'Odometer Photo',
    fuelLabel:         'Fuel Taken (litres)',
    destinationLabel:  'Destination Emirate',
    customerLabel:     'Primary Customer',
    totalDropsLabel:   'Total Drops Planned',
    arrivalTimeLabel:  'Arrival Time',
    saveStage1:        'Save Shift Start',
    savingStage1:      'Saving…',

    // Stage 2
    stage2Title:       'Leaving Warehouse',
    stage2Sub:         'Record your departure time',
    selectDriver:      'Select Driver',
    departureTimeLabel:'Departure Time',
    saveStage2:        'Save Departure',

    // Stage 3
    stage3Title:       'Last Drop',
    stage3Sub:         'Record your final delivery',
    lastDropTimeLabel: 'Last Drop Date & Time',
    lastDropPhotoLabel:'Last Drop Odometer Photo',
    failedDropsLabel:  'Number of Failed Drops',
    saveStage3:        'Save Last Drop',

    // Stage 4
    stage4Title:       'Shift Complete',
    stage4Sub:         'Close out your shift',
    endOdoLabel:       'End Odometer (km)',
    endPhotoLabel:     'End Odometer Photo',
    shiftCompleteLabel:'Shift Complete Time',
    saveStage4:        'Complete Shift',

    // GPS info banner (shown on Stage 2/3/4 screens)
    gpsTracking:       'GPS Tracking Active',
    kmTravelled:       '{km} km travelled',
    facilityLeft:      'Facility left at {time}',
    facilityNotLeft:   'Still within facility area',

    // Success screen
    successTitle:      'Saved!',
    successStage1:     'Shift started. GPS tracking is now active.',
    successStage2:     'Departure recorded.',
    successStage3:     'Last drop saved.',
    successStage4:     'Shift complete! GPS tracking stopped.',
    backToHome:        'Back to Home',

    // Camera
    takePhoto:         'Take Photo',
    retakePhoto:       'Retake',
    photoCaptured:     'Photo captured ✓',
    cameraError:       'Camera error. Tap to retry.',

    // Errors
    errRequired:       'This field is required.',
    errDriverNotFound: 'Driver not found.',
    errNoActiveShift:  'No active shift found.',
    errServer:         'Server error. Please try again.',
    errIncompleteShift:'You have an incomplete shift from {date}. Please complete {stage} first.',
  },

  hi: {
    appTitle:          'RSA ड्राइवर ऐप',
    appSubtitle:       'शिफ्ट प्रबंधन',
    loading:           'लोड हो रहा है…',
    error:             'त्रुटि',
    retry:             'पुनः प्रयास',
    save:              'सहेजें',
    cancel:            'रद्द करें',
    back:              'वापस',
    submit:            'सबमिट',
    required:          'आवश्यक',
    optional:          'वैकल्पिक',
    success:           'सफलता!',
    home:              'होम',

    langEn: 'EN', langHi: 'हिं', langAr: 'عر', langUr: 'اُر',

    loginTitle:        'अपना नाम चुनें',
    loginSubtitle:     'शुरू करने के लिए अपना नाम खोजें',
    driverSearchPlaceholder: 'ड्राइवर का नाम या ID खोजें…',
    arrivedAtFacility: 'फैसिलिटी पर पहुँचा',
    checkingLocation:  'आपकी स्थान जाँच रहे हैं…',
    tooFarFromFacility:'आप फैसिलिटी से {distance}मीटर दूर हैं।\nआगमन दर्ज करने के लिए नजदीक जाएँ।',
    locationError:     'आपकी स्थान नहीं मिली। कृपया GPS चालू करें।',
    withinGeofence:    'स्थान सत्यापित ✓',

    stage1Title:       'शिफ्ट शुरू',
    stage1Sub:         'अपनी शिफ्ट की जानकारी भरें',
    helperSection:     'हेल्पर विवरण (वैकल्पिक)',
    helperModeSearch:  'सूची से खोजें',
    helperModeManual:  'मैन्युअल दर्ज करें',
    helperNameLabel:   'हेल्पर का नाम',
    helperIdLabel:     'हेल्पर कर्मचारी ID',
    helperCoLabel:     'हेल्पर कंपनी',
    vehicleLabel:      'वाहन नंबर',
    startOdoLabel:     'शुरू ओडोमीटर (km)',
    startPhotoLabel:   'ओडोमीटर फोटो',
    fuelLabel:         'ईंधन लिया (लीटर)',
    destinationLabel:  'गंतव्य अमीरात',
    customerLabel:     'मुख्य ग्राहक',
    totalDropsLabel:   'कुल डिलीवरी',
    arrivalTimeLabel:  'आगमन समय',
    saveStage1:        'शिफ्ट शुरू करें',
    savingStage1:      'सहेज रहे हैं…',

    stage2Title:       'गोदाम छोड़ रहे हैं',
    stage2Sub:         'प्रस्थान समय दर्ज करें',
    selectDriver:      'ड्राइवर चुनें',
    departureTimeLabel:'प्रस्थान समय',
    saveStage2:        'प्रस्थान सहेजें',

    stage3Title:       'अंतिम डिलीवरी',
    stage3Sub:         'अपनी अंतिम डिलीवरी दर्ज करें',
    lastDropTimeLabel: 'अंतिम डिलीवरी समय',
    lastDropPhotoLabel:'अंतिम ओडोमीटर फोटो',
    failedDropsLabel:  'असफल डिलीवरी',
    saveStage3:        'अंतिम डिलीवरी सहेजें',

    stage4Title:       'शिफ्ट पूर्ण',
    stage4Sub:         'अपनी शिफ्ट बंद करें',
    endOdoLabel:       'अंत ओडोमीटर (km)',
    endPhotoLabel:     'अंत ओडोमीटर फोटो',
    shiftCompleteLabel:'शिफ्ट पूर्ण समय',
    saveStage4:        'शिफ्ट पूर्ण करें',

    gpsTracking:       'GPS ट्रैकिंग सक्रिय',
    kmTravelled:       '{km} km यात्रा की',
    facilityLeft:      'फैसिलिटी {time} पर छोड़ी',
    facilityNotLeft:   'अभी भी फैसिलिटी क्षेत्र में',

    successTitle:      'सफल!',
    successStage1:     'शिफ्ट शुरू हुई। GPS ट्रैकिंग सक्रिय है।',
    successStage2:     'प्रस्थान दर्ज किया गया।',
    successStage3:     'अंतिम डिलीवरी सहेजी गई।',
    successStage4:     'शिफ्ट पूर्ण! GPS ट्रैकिंग बंद हुई।',
    backToHome:        'होम पर वापस',

    takePhoto:         'फोटो लें',
    retakePhoto:       'पुनः लें',
    photoCaptured:     'फोटो लिया गया ✓',
    cameraError:       'कैमरा त्रुटि। पुनः प्रयास करें।',

    errRequired:       'यह फ़ील्ड आवश्यक है।',
    errDriverNotFound: 'ड्राइवर नहीं मिला।',
    errNoActiveShift:  'कोई सक्रिय शिफ्ट नहीं मिली।',
    errServer:         'सर्वर त्रुटि। पुनः प्रयास करें।',
    errIncompleteShift:'{date} की अधूरी शिफ्ट है। पहले {stage} पूरा करें।',
  },

  ar: {
    appTitle:          'تطبيق سائق RSA',
    appSubtitle:       'إدارة الوردية',
    loading:           'جارٍ التحميل…',
    error:             'خطأ',
    retry:             'إعادة المحاولة',
    save:              'حفظ',
    cancel:            'إلغاء',
    back:              'رجوع',
    submit:            'إرسال',
    required:          'مطلوب',
    optional:          'اختياري',
    success:           'نجاح!',
    home:              'الرئيسية',

    langEn: 'EN', langHi: 'हिं', langAr: 'عر', langUr: 'اُر',

    loginTitle:        'اختر اسمك',
    loginSubtitle:     'ابحث عن اسمك للبدء',
    driverSearchPlaceholder: 'ابحث بالاسم أو المعرف…',
    arrivedAtFacility: 'وصلت إلى المنشأة',
    checkingLocation:  'جارٍ التحقق من موقعك…',
    tooFarFromFacility:'أنت على بُعد {distance} متر من المنشأة.\nاقترب أكثر لتسجيل الوصول.',
    locationError:     'تعذّر الحصول على موقعك. يرجى تفعيل GPS.',
    withinGeofence:    'تم التحقق من الموقع ✓',

    stage1Title:       'بداية الوردية',
    stage1Sub:         'أكمل تفاصيل وردتيك',
    helperSection:     'تفاصيل المساعد (اختياري)',
    helperModeSearch:  'بحث من القائمة',
    helperModeManual:  'إدخال يدوي',
    helperNameLabel:   'اسم المساعد',
    helperIdLabel:     'معرّف المساعد',
    helperCoLabel:     'شركة المساعد',
    vehicleLabel:      'رقم المركبة',
    startOdoLabel:     'عداد البداية (كم)',
    startPhotoLabel:   'صورة العداد',
    fuelLabel:         'الوقود المأخوذ (لتر)',
    destinationLabel:  'إمارة الوجهة',
    customerLabel:     'العميل الرئيسي',
    totalDropsLabel:   'إجمالي التوصيلات',
    arrivalTimeLabel:  'وقت الوصول',
    saveStage1:        'بدء الوردية',
    savingStage1:      'جارٍ الحفظ…',

    stage2Title:       'مغادرة المستودع',
    stage2Sub:         'سجّل وقت المغادرة',
    selectDriver:      'اختر السائق',
    departureTimeLabel:'وقت المغادرة',
    saveStage2:        'حفظ المغادرة',

    stage3Title:       'آخر توصيلة',
    stage3Sub:         'سجّل توصيلتك الأخيرة',
    lastDropTimeLabel: 'تاريخ ووقت آخر توصيلة',
    lastDropPhotoLabel:'صورة عداد آخر توصيلة',
    failedDropsLabel:  'عدد التوصيلات الفاشلة',
    saveStage3:        'حفظ آخر توصيلة',

    stage4Title:       'اكتمال الوردية',
    stage4Sub:         'أغلق وردتيك',
    endOdoLabel:       'عداد النهاية (كم)',
    endPhotoLabel:     'صورة عداد النهاية',
    shiftCompleteLabel:'وقت اكتمال الوردية',
    saveStage4:        'إنهاء الوردية',

    gpsTracking:       'تتبع GPS نشط',
    kmTravelled:       'قطعت {km} كم',
    facilityLeft:      'غادرت المنشأة في {time}',
    facilityNotLeft:   'لا تزال في نطاق المنشأة',

    successTitle:      'تم الحفظ!',
    successStage1:     'بدأت الوردية. تتبع GPS نشط الآن.',
    successStage2:     'تم تسجيل المغادرة.',
    successStage3:     'تم حفظ آخر توصيلة.',
    successStage4:     'اكتملت الوردية! توقف تتبع GPS.',
    backToHome:        'العودة للرئيسية',

    takePhoto:         'التقط صورة',
    retakePhoto:       'إعادة الالتقاط',
    photoCaptured:     'تم التقاط الصورة ✓',
    cameraError:       'خطأ في الكاميرا. انقر للمحاولة.',

    errRequired:       'هذا الحقل مطلوب.',
    errDriverNotFound: 'السائق غير موجود.',
    errNoActiveShift:  'لا توجد وردية نشطة.',
    errServer:         'خطأ في الخادم. حاول مجدداً.',
    errIncompleteShift:'لديك وردية غير مكتملة من {date}. أكمل {stage} أولاً.',
  },

  ur: {
    appTitle:          'آر ایس اے ڈرائیور ایپ',
    appSubtitle:       'شفٹ مینجمنٹ',
    loading:           'لوڈ ہو رہا ہے…',
    error:             'خرابی',
    retry:             'دوبارہ کوشش',
    save:              'محفوظ کریں',
    cancel:            'منسوخ',
    back:              'واپس',
    submit:            'جمع کریں',
    required:          'لازمی',
    optional:          'اختیاری',
    success:           'کامیابی!',
    home:              'ہوم',

    langEn: 'EN', langHi: 'हिं', langAr: 'عر', langUr: 'اُر',

    loginTitle:        'اپنا نام منتخب کریں',
    loginSubtitle:     'شروع کرنے کے لیے اپنا نام تلاش کریں',
    driverSearchPlaceholder: 'ڈرائیور کا نام یا ID تلاش کریں…',
    arrivedAtFacility: 'فیسیلیٹی پر پہنچا',
    checkingLocation:  'آپ کا مقام چیک ہو رہا ہے…',
    tooFarFromFacility:'آپ فیسیلیٹی سے {distance} میٹر دور ہیں۔\nآمد درج کرنے کے لیے قریب آئیں۔',
    locationError:     'آپ کا مقام نہیں ملا۔ GPS چالو کریں۔',
    withinGeofence:    'مقام تصدیق شدہ ✓',

    stage1Title:       'شفٹ شروع',
    stage1Sub:         'اپنی شفٹ کی تفصیلات بھریں',
    helperSection:     'ہیلپر کی تفصیلات (اختیاری)',
    helperModeSearch:  'فہرست سے تلاش کریں',
    helperModeManual:  'دستی درج کریں',
    helperNameLabel:   'ہیلپر کا نام',
    helperIdLabel:     'ہیلپر ملازم ID',
    helperCoLabel:     'ہیلپر کمپنی',
    vehicleLabel:      'گاڑی نمبر',
    startOdoLabel:     'شروع اوڈومیٹر (km)',
    startPhotoLabel:   'اوڈومیٹر فوٹو',
    fuelLabel:         'ایندھن لیا (لیٹر)',
    destinationLabel:  'منزل امارات',
    customerLabel:     'بنیادی گاہک',
    totalDropsLabel:   'کل ڈیلیوری',
    arrivalTimeLabel:  'آمد کا وقت',
    saveStage1:        'شفٹ شروع کریں',
    savingStage1:      'محفوظ ہو رہا ہے…',

    stage2Title:       'گودام چھوڑ رہے ہیں',
    stage2Sub:         'روانگی کا وقت درج کریں',
    selectDriver:      'ڈرائیور منتخب کریں',
    departureTimeLabel:'روانگی کا وقت',
    saveStage2:        'روانگی محفوظ کریں',

    stage3Title:       'آخری ڈیلیوری',
    stage3Sub:         'اپنی آخری ڈیلیوری درج کریں',
    lastDropTimeLabel: 'آخری ڈیلیوری کا وقت',
    lastDropPhotoLabel:'آخری اوڈومیٹر فوٹو',
    failedDropsLabel:  'ناکام ڈیلیوری کی تعداد',
    saveStage3:        'آخری ڈیلیوری محفوظ کریں',

    stage4Title:       'شفٹ مکمل',
    stage4Sub:         'اپنی شفٹ بند کریں',
    endOdoLabel:       'آخری اوڈومیٹر (km)',
    endPhotoLabel:     'آخری اوڈومیٹر فوٹو',
    shiftCompleteLabel:'شفٹ مکمل وقت',
    saveStage4:        'شفٹ مکمل کریں',

    gpsTracking:       'GPS ٹریکنگ فعال',
    kmTravelled:       '{km} km سفر کیا',
    facilityLeft:      'فیسیلیٹی {time} پر چھوڑی',
    facilityNotLeft:   'ابھی بھی فیسیلیٹی کے قریب ہیں',

    successTitle:      'محفوظ ہو گیا!',
    successStage1:     'شفٹ شروع ہوئی۔ GPS ٹریکنگ فعال ہے۔',
    successStage2:     'روانگی درج ہو گئی۔',
    successStage3:     'آخری ڈیلیوری محفوظ ہوئی۔',
    successStage4:     'شفٹ مکمل! GPS ٹریکنگ بند ہوئی۔',
    backToHome:        'ہوم پر واپس',

    takePhoto:         'فوٹو لیں',
    retakePhoto:       'دوبارہ لیں',
    photoCaptured:     'فوٹو لیا گیا ✓',
    cameraError:       'کیمرہ خرابی۔ دوبارہ کوشش کریں۔',

    errRequired:       'یہ فیلڈ لازمی ہے۔',
    errDriverNotFound: 'ڈرائیور نہیں ملا۔',
    errNoActiveShift:  'کوئی فعال شفٹ نہیں ملی۔',
    errServer:         'سرور خرابی۔ دوبارہ کوشش کریں۔',
    errIncompleteShift:'{date} کی نامکمل شفٹ ہے۔ پہلے {stage} مکمل کریں۔',
  },
};

// Helper to get a translation with variable substitution
// e.g. t('tooFarFromFacility', 'en', { distance: 350 })
export function t(key, lang, vars = {}) {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  let str = dict[key] || TRANSLATIONS.en[key] || key;
  Object.entries(vars).forEach(([k, v]) => {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  });
  return str;
}

// RTL languages
export function isRTL(lang) {
  return lang === 'ar' || lang === 'ur';
}
