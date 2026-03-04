// =============================================================================
// RSA DRIVER APP — PILOT — Google Apps Script Backend
// =============================================================================
// SETUP (one-time):
//   1. Paste this entire file into a Google Apps Script project
//   2. Fill in YOUR values for SPREADSHEET_ID and DRIVE_FOLDER_ID
//   3. Deploy as Web App: Execute as "Me", Who has access "Anyone"
//   4. Copy the /exec URL into DriverAppPilot/src/config.js → GAS_URL
// =============================================================================

const SPREADSHEET_ID   = '1VB3K9JCUCdiGEbALxKpuWcJKaQ-H0S5b3JRK21l1fCE';
const DRIVE_FOLDER_ID  = '1ZG9GX9ohs3n3tVVQVMvFf9xfPlByTwwE';

const DROPDOWN_SHEET   = 'Dropdown List';
const ATTENDANCE_SHEET = 'Attendance Data';
const USERNAMES_SHEET  = 'Usernames';
const OVERTIME_HOURS   = 9;
const TIMEZONE         = 'Asia/Dubai';
const GOOGLE_MAPS_API_KEY = 'AIzaSyCkwplnJDtC5yjj8vmkiaWCBz05VJLjKl8';

// Attendance Data column numbers (1-based, matching sheet columns A–Z)
// COLUMN ORDER (26 cols):  A–O unchanged, then:
//   P(16): DEPARTURE | Q(17): FACILITY_LEFT_AUTO | R(18): LAST_DROP
//   S(19): LAST_DROP_PHOTO | T(20): FAILED_DROPS | U(21): END_TIME
//   V(22): END_ODO | W(23): END_PHOTO | X(24): SHIFT_DURATION
//   Y(25): OVERTIME | Z(26): GPS_KM
const COL = {
  ROW_ID:            1,  // A
  SHIFT_DATE:        2,  // B
  DRIVER_ID:         3,  // C
  DRIVER_NAME:       4,  // D
  HELPER_ID:         5,  // E
  HELPER_NAME:       6,  // F
  HELPER_COMPANY:    7,  // G
  VEHICLE:           8,  // H
  START_ODO:         9,  // I
  START_PHOTO:       10, // J
  FUEL:              11, // K
  DESTINATION:       12, // L
  PRIMARY_CUSTOMER:  13, // M
  TOTAL_DROPS:       14, // N
  ARRIVAL:           15, // O
  DEPARTURE:         16, // P
  FACILITY_LEFT:     17, // Q — auto GPS departure time (500m)
  LAST_DROP:         18, // R
  LAST_DROP_PHOTO:   19, // S
  FAILED_DROPS:      20, // T
  END_TIME:          21, // U
  END_ODO:           22, // V
  END_PHOTO:         23, // W
  SHIFT_DURATION:    24, // X
  OVERTIME:          25, // Y
  GPS_KM:            26  // Z — total GPS km travelled during shift
};

const HEADERS = [
  'Row ID', 'Shift Date', 'Driver Employee ID', 'Driver Name',
  'Helper Employee ID', 'Helper Name', 'Helper Company', 'Vehicle Number',
  'Start Odometer (km)', 'Start Odometer Photo URL', 'Fuel Taken',
  'Destination Emirate', 'Primary Customer Name', 'Total Drops',
  'Arrival at Gate', 'Departure from Warehouse',
  'Facility Left Time (Auto GPS)',
  'Last Drop Date & Time', 'Last Drop Odo Photo URL',
  'Number of Failed Drops', 'Shift Complete Date & Time',
  'End Odometer (km)', 'End Odometer Photo URL',
  'Shift Duration (hrs)', 'Overtime Hours',
  'GPS KM Travelled'
];

// =============================================================================
// REST API ENTRY POINTS
// =============================================================================

function doGet(e) {
  var param  = (e && e.parameter) ? e.parameter : {};
  var action = param.action || '';

  // Serve web admin dashboard when no action (or action=admin) is specified
  if (!action || action === 'admin') {
    return HtmlService.createHtmlOutput(getAdminHtml_())
      .setTitle('RSA Driver Pilot — Admin Dashboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  var result;
  try {
    if (action === 'getDropdowns') {
      result = getInitialData();
    } else if (action === 'authenticateUser') {
      result = authenticateUser(param.userId, param.password);
    } else if (action === 'getActiveDrivers') {
      result = { drivers: getActiveDriversForEndShift() };
    } else if (action === 'getStage1PendingDrivers') {
      result = { drivers: getStage1PendingDrivers() };
    } else if (action === 'getStage3PendingDrivers') {
      result = { drivers: getStage3PendingDrivers() };
    } else if (action === 'getDriverDashboard') {
      result = getDriverDashboard(param.userId, param.month);
    } else if (action === 'getAdminDashboard') {
      result = getAdminDashboard(param.date);
    } else if (action === 'getLiveOperations') {
      result = getLiveOperations();
    } else if (action === 'getActiveDriversLive') {
      result = getActiveDriversLive();
    } else if (action === 'getDriverRoute') {
      result = getDriverRoute(param.driverId, param.date, param.shiftRowId);
    } else {
      result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var body   = {};
  var result = {};

  try {
    body = JSON.parse(e.postData.contents);
    var action = body.action || '';

    if (action === 'saveShiftStart') {
      result = saveShiftStart(body.data);
    } else if (action === 'saveDeparture') {
      result = saveDeparture(body.data);
    } else if (action === 'saveLastDrop') {
      result = saveLastDrop(body.data);
    } else if (action === 'saveShiftEnd') {
      result = saveShiftEnd(body.data);
    } else if (action === 'saveGpsPoint') {
      result = saveGpsPoint(body.data);
    } else if (action === 'updateFacilityLeft') {
      result = updateFacilityLeft(body.data);
    } else {
      result = { success: false, error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { success: false, error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// =============================================================================
// AUTHENTICATION
// =============================================================================

function authenticateUser(userId, password) {
  if (!userId || !password) {
    return { success: false, error: 'User ID and password are required.' };
  }

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(USERNAMES_SHEET);

  if (!sheet) {
    return { success: false, error: 'Usernames sheet not found.' };
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { success: false, error: 'No users configured.' };
  }

  var values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();

  for (var i = 0; i < values.length; i++) {
    var rowUserId   = String(values[i][0]).trim();
    var rowUserName = String(values[i][1]).trim();
    var rowPassword = String(values[i][2]).trim();

    if (rowUserId.toLowerCase() === userId.toLowerCase()) {
      if (rowPassword === password) {
        return {
          success:  true,
          userId:   rowUserId,
          userName: rowUserName,
          isAdmin:  rowUserId.toLowerCase() === 'admin'
        };
      } else {
        return { success: false, error: 'Incorrect password.' };
      }
    }
  }

  return { success: false, error: 'User ID not found.' };
}

// =============================================================================
// INITIAL DATA LOAD (dropdown lists)
// =============================================================================

function getInitialData() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(DROPDOWN_SHEET);

  if (!sheet) {
    throw new Error('Sheet "' + DROPDOWN_SHEET + '" not found in the spreadsheet.');
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { drivers: [], helpers: [], vehicles: [], destinations: [], customers: [], helperCompanies: [] };
  }

  var values = sheet.getRange(2, 1, lastRow - 1, 22).getValues();

  var drivers         = [];
  var helpers         = [];
  var vehicles        = [];
  var destinations    = [];
  var customers       = [];
  var helperCompanies = [];
  var vehicleSet      = {};
  var destSet         = {};
  var custSet         = {};
  var helperCoSet     = {};
  var driverSet       = {};
  var helperSet       = {};

  values.forEach(function(row) {
    var driverId   = String(row[0]).trim();
    var driverName = String(row[1]).trim();
    var helperId   = String(row[4]).trim();
    var helperName = String(row[5]).trim();
    var helperCo   = String(row[6]).trim();
    var vehicle    = String(row[9]).trim();
    var dest       = String(row[18]).trim();
    var customer   = String(row[21]).trim();
    var supplierCo = String(row[16]).trim();

    if (driverId && driverName && !driverSet[driverId]) {
      driverSet[driverId] = true;
      drivers.push({ id: driverId, name: driverName });
    }
    if (helperId && helperName && !helperSet[helperId]) {
      helperSet[helperId] = true;
      helpers.push({ id: helperId, name: helperName, company: helperCo });
    }
    if (vehicle && !vehicleSet[vehicle]) {
      vehicleSet[vehicle] = true;
      vehicles.push({ number: vehicle });
    }
    if (dest && !destSet[dest]) {
      destSet[dest] = true;
      destinations.push(dest);
    }
    if (customer && !custSet[customer]) {
      custSet[customer] = true;
      customers.push({ name: customer });
    }
    if (supplierCo && !helperCoSet[supplierCo]) {
      helperCoSet[supplierCo] = true;
      helperCompanies.push(supplierCo);
    }
  });

  return {
    drivers:         drivers,
    helpers:         helpers,
    vehicles:        vehicles,
    destinations:    destinations,
    customers:       customers,
    helperCompanies: helperCompanies.sort()
  };
}

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

function getOrCreateAttendanceSheet_() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(ATTENDANCE_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(ATTENDANCE_SHEET);
    var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setValues([HEADERS]);
    headerRange.setBackground('#1565C0');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 220);
  }

  return sheet;
}

function formatDubai_(date) {
  return Utilities.formatDate(date, TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
}

function formatDateOnly_(date) {
  return Utilities.formatDate(date, TIMEZONE, 'dd/MM/yyyy');
}

function parseDatetimeLocal_(dtLocal) {
  if (!dtLocal) return null;
  try {
    var p = dtLocal.split('T');
    var d = p[0].split('-');
    var t = (p[1] || '00:00').split(':');
    var s = d[2] + '/' + d[1] + '/' + d[0] + ' ' + t[0] + ':' + t[1] + ':00';
    return Utilities.parseDate(s, TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
  } catch(e) { return null; }
}

function cellToDateStr_(val) {
  if (!val) return '';
  if (val instanceof Date) return formatDateOnly_(val);
  return String(val).trim();
}

function cellToDatetimeStr_(val) {
  if (!val) return '';
  if (val instanceof Date) return formatDubai_(val);
  return String(val).trim();
}

function generateRowId_(driverId) {
  var stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd-HHmmss');
  return 'SHIFT-' + stamp + '-' + driverId;
}

function saveOdometerPhoto_(base64Data, filename) {
  if (!base64Data) return '';
  var cleaned = base64Data.replace(/^data:image\/\w+;base64,/, '');
  var bytes   = Utilities.base64Decode(cleaned);
  var blob    = Utilities.newBlob(bytes, 'image/jpeg', filename);
  var folder  = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  var file    = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/uc?export=view&id=' + file.getId();
}

function parseDubaiDate_(str) {
  if (!str) return null;
  var parts = str.split(' ');
  if (parts.length < 2) return null;
  var d = parts[0].split('/');
  var t = parts[1].split(':');
  if (d.length < 3 || t.length < 2) return null;
  return new Date(
    parseInt(d[2]), parseInt(d[1]) - 1, parseInt(d[0]),
    parseInt(t[0]), parseInt(t[1]), t[2] ? parseInt(t[2]) : 0
  );
}

function findRowByRowId_(sheet, rowId) {
  var finder = sheet.createTextFinder(rowId).findNext();
  if (!finder || finder.getColumn() !== 1) return null;
  return finder.getRow();
}

function hoursDiff_(dateA, dateB) {
  if (!dateA || !dateB) return 0;
  return Math.round(Math.abs(dateB - dateA) / 3600000 * 100) / 100;
}

function getDateRangeValues_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
}

// =============================================================================
// STAGE 1 — SHIFT START (arrival at facility — GPS only)
// Now only saves: driverId, driverName, arrivalTime, shiftDate
// Vehicle/helper details saved at Stage 2 (departure)
// =============================================================================

function saveShiftStart(data) {
  try {
    var sheet = getOrCreateAttendanceSheet_();

    if (!data.shiftStartTime) {
      return { success: false, error: 'Shift start time is required.' };
    }
    var arrivalDate = parseDatetimeLocal_(data.shiftStartTime);
    if (!arrivalDate) {
      return { success: false, error: 'Invalid shift start time.' };
    }

    // Guard: check if this driver has any incomplete shift
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var allData = sheet.getRange(2, 1, lastRow - 1, COL.OVERTIME).getValues();
      for (var i = 0; i < allData.length; i++) {
        var r              = allData[i];
        var existingDriver = String(r[COL.DRIVER_ID - 1]).trim();
        var existingEnd    = cellToDatetimeStr_(r[COL.END_TIME - 1]);
        if (existingDriver !== data.userId) continue;
        if (existingEnd) continue;

        var existingDate      = cellToDateStr_(r[COL.SHIFT_DATE - 1]);
        var existingArrival   = cellToDatetimeStr_(r[COL.ARRIVAL - 1]);
        var existingDeparture = cellToDatetimeStr_(r[COL.DEPARTURE - 1]);
        var existingLastDrop  = cellToDatetimeStr_(r[COL.LAST_DROP - 1]);

        var stageLabel;
        if (existingArrival && !existingDeparture && !existingLastDrop) {
          stageLabel = 'Stage 2 (Departure)';
        } else if (existingDeparture && !existingLastDrop) {
          stageLabel = 'Stage 3 (Last Drop)';
        } else if (existingLastDrop) {
          stageLabel = 'Stage 4 (Shift Complete)';
        } else {
          stageLabel = 'Stage 1';
        }

        return {
          success: false,
          error: 'You have an incomplete shift from ' + existingDate + '. Please complete ' + stageLabel + ' before starting a new shift.',
          incompleteShiftDate:  existingDate,
          incompleteShiftStage: stageLabel
        };
      }
    }

    var rowId = generateRowId_(data.userId);

    // Build row — only arrival fields; vehicle/helper filled at Stage 2
    var row = new Array(HEADERS.length).fill('');
    row[COL.ROW_ID - 1]      = rowId;
    row[COL.SHIFT_DATE - 1]  = formatDateOnly_(arrivalDate); // date only, no time
    row[COL.DRIVER_ID - 1]   = data.userId;
    row[COL.DRIVER_NAME - 1] = data.userName;
    row[COL.ARRIVAL - 1]     = arrivalDate;

    sheet.appendRow(row);

    return { success: true, rowId: rowId, arrivalTime: formatDubai_(arrivalDate) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =============================================================================
// STAGE 2 — DEPARTURE (now also captures vehicle/helper/odometer details)
// =============================================================================

function getStage1PendingDrivers() {
  try {
    var sheet   = getOrCreateAttendanceSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    var values = sheet.getRange(2, 1, lastRow - 1, COL.OVERTIME).getValues();
    var result = [];

    values.forEach(function(row) {
      var arrival   = cellToDatetimeStr_(row[COL.ARRIVAL - 1]);
      var departure = cellToDatetimeStr_(row[COL.DEPARTURE - 1]);
      var endTime   = cellToDatetimeStr_(row[COL.END_TIME - 1]);

      if (arrival && !departure && !endTime) {
        result.push({
          rowId:      String(row[COL.ROW_ID - 1]).trim(),
          driverId:   String(row[COL.DRIVER_ID - 1]).trim(),
          driverName: String(row[COL.DRIVER_NAME - 1]).trim(),
          arrivalTime: arrival
        });
      }
    });

    return result.sort(function(a, b) { return a.driverName.localeCompare(b.driverName); });
  } catch (err) {
    return [];
  }
}

// data: { rowId, departureTime, helperName, helperId?, helperCompany?,
//         vehicleNumber, startOdometer, startPhotoBase64, fuelTaken?,
//         destinationEmirate?, primaryCustomer?, totalDrops,
//         autoFacilityLeftTime? }
function saveDeparture(data) {
  try {
    if (!data.departureTime) {
      return { success: false, error: 'Departure time is required.' };
    }
    var sheet  = getOrCreateAttendanceSheet_();
    var rowNum = findRowByRowId_(sheet, data.rowId);
    if (!rowNum) {
      return { success: false, error: 'Shift record not found.' };
    }

    var departureDate = parseDatetimeLocal_(data.departureTime);
    if (!departureDate) {
      return { success: false, error: 'Invalid departure time.' };
    }

    // Save photo if provided
    var photoUrl = '';
    if (data.startPhotoBase64) {
      photoUrl = saveOdometerPhoto_(data.startPhotoBase64, data.rowId + '_start.jpg');
    }

    // Write all vehicle/helper details + departure
    sheet.getRange(rowNum, COL.HELPER_ID).setValue(data.helperId || '');
    sheet.getRange(rowNum, COL.HELPER_NAME).setValue(data.helperName || '');
    sheet.getRange(rowNum, COL.HELPER_COMPANY).setValue(data.helperCompany || '');
    sheet.getRange(rowNum, COL.VEHICLE).setValue(data.vehicleNumber || '');
    sheet.getRange(rowNum, COL.START_ODO).setValue(Number(data.startOdometer) || 0);
    sheet.getRange(rowNum, COL.START_PHOTO).setValue(photoUrl);
    sheet.getRange(rowNum, COL.FUEL).setValue(data.fuelTaken || '');
    sheet.getRange(rowNum, COL.DESTINATION).setValue(data.destinationEmirate || '');
    sheet.getRange(rowNum, COL.PRIMARY_CUSTOMER).setValue(data.primaryCustomer || '');
    sheet.getRange(rowNum, COL.TOTAL_DROPS).setValue(Number(data.totalDrops) || 0);
    sheet.getRange(rowNum, COL.DEPARTURE).setValue(departureDate);

    // Auto GPS facility left time (500m detection from device)
    if (data.autoFacilityLeftTime) {
      var autoLeftDate = parseDatetimeLocal_(data.autoFacilityLeftTime);
      if (autoLeftDate) {
        sheet.getRange(rowNum, COL.FACILITY_LEFT).setValue(formatDubai_(autoLeftDate));
      } else {
        sheet.getRange(rowNum, COL.FACILITY_LEFT).setValue(data.autoFacilityLeftTime);
      }
    }

    return { success: true, departureTime: formatDubai_(departureDate) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =============================================================================
// STAGE 3 — LAST DROP
// =============================================================================

function getActiveDriversForEndShift() {
  try {
    var sheet   = getOrCreateAttendanceSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    var values = sheet.getRange(2, 1, lastRow - 1, COL.OVERTIME).getValues();
    var result = [];

    values.forEach(function(row) {
      var arrival   = cellToDatetimeStr_(row[COL.ARRIVAL - 1]);
      var lastDrop  = cellToDatetimeStr_(row[COL.LAST_DROP - 1]);
      var endTime   = cellToDatetimeStr_(row[COL.END_TIME - 1]);

      if (arrival && !lastDrop && !endTime) {
        result.push({
          rowId:         String(row[COL.ROW_ID - 1]).trim(),
          driverId:      String(row[COL.DRIVER_ID - 1]).trim(),
          driverName:    String(row[COL.DRIVER_NAME - 1]).trim(),
          vehicleNumber: String(row[COL.VEHICLE - 1]).trim()
        });
      }
    });

    return result.sort(function(a, b) { return a.driverName.localeCompare(b.driverName); });
  } catch (err) {
    return [];
  }
}

// data: { rowId, lastDropTime, lastDropPhotoBase64?, failedDrops, endOdometer? }
function saveLastDrop(data) {
  try {
    var sheet  = getOrCreateAttendanceSheet_();
    var rowNum = findRowByRowId_(sheet, data.rowId);
    if (!rowNum) {
      return { success: false, error: 'Shift record not found.' };
    }

    if (!data.lastDropTime) {
      return { success: false, error: 'Last drop date & time is required.' };
    }

    var photoUrl = '';
    if (data.lastDropPhotoBase64) {
      photoUrl = saveOdometerPhoto_(data.lastDropPhotoBase64, data.rowId + '_lastdrop.jpg');
    }

    var lastDropDate = parseDatetimeLocal_(data.lastDropTime);
    if (!lastDropDate) {
      return { success: false, error: 'Invalid last drop time.' };
    }

    sheet.getRange(rowNum, COL.LAST_DROP).setValue(lastDropDate);
    sheet.getRange(rowNum, COL.LAST_DROP_PHOTO).setValue(photoUrl);
    sheet.getRange(rowNum, COL.FAILED_DROPS).setValue(Number(data.failedDrops) || 0);

    return { success: true, submitTime: formatDubai_(lastDropDate) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =============================================================================
// STAGE 4 — SHIFT COMPLETE
// =============================================================================

function getStage3PendingDrivers() {
  try {
    var sheet   = getOrCreateAttendanceSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    var values = sheet.getRange(2, 1, lastRow - 1, COL.OVERTIME).getValues();
    var result = [];

    values.forEach(function(row) {
      var lastDrop = cellToDatetimeStr_(row[COL.LAST_DROP - 1]);
      var endTime  = cellToDatetimeStr_(row[COL.END_TIME - 1]);

      if (lastDrop && !endTime) {
        result.push({
          rowId:         String(row[COL.ROW_ID - 1]).trim(),
          driverId:      String(row[COL.DRIVER_ID - 1]).trim(),
          driverName:    String(row[COL.DRIVER_NAME - 1]).trim(),
          vehicleNumber: String(row[COL.VEHICLE - 1]).trim()
        });
      }
    });

    return result.sort(function(a, b) { return a.driverName.localeCompare(b.driverName); });
  } catch (err) {
    return [];
  }
}

// data: { rowId, endOdometer, endPhotoBase64, shiftCompleteTime, gpsKm? }
function saveShiftEnd(data) {
  try {
    var sheet  = getOrCreateAttendanceSheet_();
    var rowNum = findRowByRowId_(sheet, data.rowId);
    if (!rowNum) {
      return { success: false, error: 'Shift record not found.' };
    }

    var photoUrl = '';
    if (data.endPhotoBase64) {
      photoUrl = saveOdometerPhoto_(data.endPhotoBase64, data.rowId + '_end.jpg');
    }

    if (!data.shiftCompleteTime) {
      return { success: false, error: 'Shift complete time is required.' };
    }
    var endDate = parseDatetimeLocal_(data.shiftCompleteTime);
    if (!endDate) {
      return { success: false, error: 'Invalid shift complete time.' };
    }

    var arrivalVal  = sheet.getRange(rowNum, COL.ARRIVAL).getValue();
    var arrivalDate = (arrivalVal instanceof Date) ? arrivalVal : parseDubaiDate_(String(arrivalVal).trim());

    var lastDropVal  = sheet.getRange(rowNum, COL.LAST_DROP).getValue();
    var lastDropDate = (lastDropVal instanceof Date) ? lastDropVal : parseDubaiDate_(String(lastDropVal).trim());

    // Shift duration = arrival to shift complete
    var shiftDuration = 0;
    var overtime      = 0;
    if (arrivalDate && endDate) {
      shiftDuration = Math.round(((endDate - arrivalDate) / 3600000) * 100) / 100;
      overtime      = Math.round(Math.max(0, shiftDuration - OVERTIME_HOURS) * 100) / 100;
    }

    sheet.getRange(rowNum, COL.END_TIME).setValue(endDate);
    sheet.getRange(rowNum, COL.END_ODO).setValue(Number(data.endOdometer) || 0);
    sheet.getRange(rowNum, COL.END_PHOTO).setValue(photoUrl);
    sheet.getRange(rowNum, COL.SHIFT_DURATION).setValue(shiftDuration);
    sheet.getRange(rowNum, COL.OVERTIME).setValue(overtime);

    if (data.gpsKm !== undefined && data.gpsKm !== null) {
      sheet.getRange(rowNum, COL.GPS_KM).setValue(Math.round(Number(data.gpsKm) * 100) / 100);
    }

    return {
      success:       true,
      shiftDuration: shiftDuration,
      overtime:      overtime,
      gpsKm:         data.gpsKm || 0
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =============================================================================
// UPDATE FACILITY LEFT TIME — called from GPS background task when 500m is
// detected AFTER Stage 2 has already been submitted (Column Q was null then).
// data: { rowId, facilityLeftTime }  — facilityLeftTime is an ISO string
// =============================================================================
function updateFacilityLeft(data) {
  try {
    if (!data || !data.rowId || !data.facilityLeftTime) {
      return { success: false, error: 'rowId and facilityLeftTime required.' };
    }
    var sheet  = getOrCreateAttendanceSheet_();
    var rowNum = findRowByRowId_(sheet, data.rowId);
    if (!rowNum) {
      return { success: false, error: 'Shift record not found.' };
    }
    // Only write if column Q is still empty (don't overwrite if saveDeparture already set it)
    var existing = sheet.getRange(rowNum, COL.FACILITY_LEFT).getValue();
    if (existing && String(existing).trim() !== '') {
      return { success: true, skipped: true };
    }
    var leftDate = parseDatetimeLocal_(data.facilityLeftTime);
    if (leftDate) {
      sheet.getRange(rowNum, COL.FACILITY_LEFT).setValue(formatDubai_(leftDate));
    } else {
      sheet.getRange(rowNum, COL.FACILITY_LEFT).setValue(data.facilityLeftTime);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =============================================================================
// DRIVER DASHBOARD
// =============================================================================

function getDriverDashboard(userId, monthStr) {
  try {
    if (!userId) return { error: 'userId required' };

    var sheet  = getOrCreateAttendanceSheet_();
    var values = getDateRangeValues_(sheet);

    // Determine month filter
    var now       = new Date();
    var monthYear = monthStr || Utilities.formatDate(now, TIMEZONE, 'yyyy-MM');
    var yStr      = monthYear.split('-')[0];
    var mStr      = monthYear.split('-')[1];
    var monthNum  = parseInt(mStr) - 1;
    var yearNum   = parseInt(yStr);

    var todayStr     = Utilities.formatDate(now, TIMEZONE, 'dd/MM/yyyy');
    var yesterdayStr = Utilities.formatDate(new Date(now.getTime() - 86400000), TIMEZONE, 'dd/MM/yyyy');

    var daysPresent    = 0;
    var totalOT        = 0;
    var overtimeByDate = {};
    var kmByDate       = {};
    var vehHoursByDate = {};
    var failedToday    = 0;
    var failedYesterday = 0;
    var failedMonth    = 0;
    var totalDropsMonth = 0;
    var dayMap         = {};

    values.forEach(function(row) {
      var driverId = String(row[COL.DRIVER_ID - 1]).trim();
      if (driverId !== userId) return;

      var shiftDateVal = row[COL.SHIFT_DATE - 1];
      if (!shiftDateVal) return;
      var shiftDate = (shiftDateVal instanceof Date) ? shiftDateVal : parseDubaiDate_(String(shiftDateVal));
      if (!shiftDate) return;

      // Only current month
      if (shiftDate.getMonth() !== monthNum || shiftDate.getFullYear() !== yearNum) return;

      var dateKey    = formatDateOnly_(shiftDate);
      var endTime    = cellToDatetimeStr_(row[COL.END_TIME - 1]);
      var ot         = parseFloat(row[COL.OVERTIME - 1]) || 0;
      var gpsKm      = parseFloat(row[COL.GPS_KM - 1]) || 0;
      var duration   = parseFloat(row[COL.SHIFT_DURATION - 1]) || 0;
      var failedDrops = parseInt(row[COL.FAILED_DROPS - 1]) || 0;
      var totalDrops  = parseInt(row[COL.TOTAL_DROPS - 1]) || 0;

      // Vehicle running hours: departure to last drop
      var departureVal  = row[COL.DEPARTURE - 1];
      var lastDropVal   = row[COL.LAST_DROP - 1];
      var departureDate = (departureVal instanceof Date) ? departureVal : parseDubaiDate_(String(departureVal));
      var lastDropDate  = (lastDropVal instanceof Date) ? lastDropVal : parseDubaiDate_(String(lastDropVal));
      var vehHours      = hoursDiff_(departureDate, lastDropDate);

      if (endTime) daysPresent++;

      overtimeByDate[dateKey] = (overtimeByDate[dateKey] || 0) + ot;
      kmByDate[dateKey]       = (kmByDate[dateKey] || 0) + gpsKm;
      vehHoursByDate[dateKey] = (vehHoursByDate[dateKey] || 0) + vehHours;
      totalOT += ot;

      failedMonth     += failedDrops;
      totalDropsMonth += totalDrops;

      if (dateKey === todayStr)     failedToday     += failedDrops;
      if (dateKey === yesterdayStr) failedYesterday += failedDrops;

      dayMap[dateKey] = {
        date:          dateKey,
        km:            gpsKm,
        vehicleHours:  vehHours,
        overtime:      ot,
        failedDrops:   failedDrops,
        totalDrops:    totalDrops,
        shiftDuration: duration
      };
    });

    // KM summaries
    var last7Days = 0;
    var kmYesterday = kmByDate[yesterdayStr] || 0;
    var vehYesterday = vehHoursByDate[yesterdayStr] || 0;
    var last7VehHours = 0;
    var totalKmMonth  = 0;
    var totalVehMonth = 0;

    Object.keys(kmByDate).forEach(function(dk) {
      totalKmMonth  += kmByDate[dk];
      totalVehMonth += vehHoursByDate[dk] || 0;
      var d = parseDubaiDate_(dk + ' 00:00:00');
      if (d && (now - d) <= 7 * 86400000) {
        last7Days     += kmByDate[dk];
        last7VehHours += vehHoursByDate[dk] || 0;
      }
    });

    var otDates     = Object.keys(overtimeByDate).sort();
    var kmDates     = Object.keys(kmByDate).sort();
    var dayBreakdown = Object.values(dayMap).sort(function(a, b) { return b.date.localeCompare(a.date); });

    return {
      success:      true,
      daysPresent:  daysPresent,
      overtimeHours: Math.round(totalOT * 100) / 100,
      overtimeByDate: otDates.map(function(d) { return { date: d, overtime: overtimeByDate[d] }; }),
      failedDrops: {
        today:        failedToday,
        yesterday:    failedYesterday,
        monthTotal:   failedMonth,
        monthPercent: totalDropsMonth > 0 ? Math.round(failedMonth / totalDropsMonth * 1000) / 10 : 0
      },
      kmData: {
        yesterday: Math.round(kmYesterday * 100) / 100,
        last7Days: Math.round(last7Days * 100) / 100,
        monthTotal: Math.round(totalKmMonth * 100) / 100
      },
      kmByDate: kmDates.map(function(d) { return { date: d, km: kmByDate[d] }; }),
      vehicleHours: {
        yesterday: Math.round(vehYesterday * 100) / 100,
        last7Days: Math.round(last7VehHours * 100) / 100,
        monthTotal: Math.round(totalVehMonth * 100) / 100
      },
      vehicleHoursByDate: kmDates.map(function(d) { return { date: d, hours: vehHoursByDate[d] || 0 }; }),
      dayBreakdown: dayBreakdown
    };
  } catch (err) {
    return { error: err.message };
  }
}

// =============================================================================
// ADMIN DASHBOARD
// =============================================================================

function getAdminDashboard(dateStr) {
  try {
    var sheet  = getOrCreateAttendanceSheet_();
    var values = getDateRangeValues_(sheet);

    var now     = new Date();
    var today   = dateStr || Utilities.formatDate(now, TIMEZONE, 'dd/MM/yyyy');
    // Normalize dateStr if in YYYY-MM-DD format
    if (dateStr && dateStr.indexOf('-') !== -1) {
      var dp = dateStr.split('-');
      today  = dp[2] + '/' + dp[1] + '/' + dp[0];
    }

    var yesterday = Utilities.formatDate(new Date(now.getTime() - 86400000), TIMEZONE, 'dd/MM/yyyy');

    var activeDriversToday = 0;
    var driversOnRoad      = 0;
    var totalDropsToday    = 0;
    var failedDropsToday   = 0;
    var shiftDurations     = [];
    var punchOutMisses     = [];
    var liveOps            = [];

    // Monthly data
    var monthYear  = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM');
    var yearNum    = parseInt(monthYear.split('-')[0]);
    var monthNum   = parseInt(monthYear.split('-')[1]) - 1;

    // Aggregation maps
    var failedByDate       = {};
    var totalByDate        = {};
    var shiftDurationByDate = {};
    var otByDate           = {};
    var driverDetailMap    = {};
    var vehicleKmByDate    = {};
    var vehicleHrsByDate   = {};
    var helpersByDate      = {};
    var stageTimingsToday  = [];
    var helperCompanySet   = {};

    values.forEach(function(row) {
      var shiftDateVal = row[COL.SHIFT_DATE - 1];
      if (!shiftDateVal) return;
      var shiftDate = (shiftDateVal instanceof Date) ? shiftDateVal : parseDubaiDate_(String(shiftDateVal));
      if (!shiftDate) return;
      var dateKey = formatDateOnly_(shiftDate);

      var driverName   = String(row[COL.DRIVER_NAME - 1]).trim();
      var driverId     = String(row[COL.DRIVER_ID - 1]).trim();
      var vehicle      = String(row[COL.VEHICLE - 1]).trim();
      var arrivalVal   = row[COL.ARRIVAL - 1];
      var departureVal = row[COL.DEPARTURE - 1];
      var lastDropVal  = row[COL.LAST_DROP - 1];
      var endTimeStr   = cellToDatetimeStr_(row[COL.END_TIME - 1]);
      var failedDrops  = parseInt(row[COL.FAILED_DROPS - 1]) || 0;
      var totalDrops   = parseInt(row[COL.TOTAL_DROPS - 1]) || 0;
      var gpsKm        = parseFloat(row[COL.GPS_KM - 1]) || 0;
      var duration     = parseFloat(row[COL.SHIFT_DURATION - 1]) || 0;
      var ot           = parseFloat(row[COL.OVERTIME - 1]) || 0;
      var helperName   = String(row[COL.HELPER_NAME - 1]).trim();
      var helperCompany = String(row[COL.HELPER_COMPANY - 1]).trim();

      var arrivalDate  = (arrivalVal instanceof Date) ? arrivalVal : parseDubaiDate_(String(arrivalVal));
      var departDate   = (departureVal instanceof Date) ? departureVal : parseDubaiDate_(String(departureVal));
      var lastDropDate = (lastDropVal instanceof Date) ? lastDropVal : parseDubaiDate_(String(lastDropVal));

      var arrivalStr  = arrivalDate  ? formatDubai_(arrivalDate)  : '';
      var departStr   = departDate   ? formatDubai_(departDate)   : '';
      var lastDropStr = lastDropDate ? formatDubai_(lastDropDate) : '';

      // Current stage determination
      var currentStage;
      if (!arrivalStr)       currentStage = 0;
      else if (!departStr)   currentStage = 1;
      else if (!lastDropStr) currentStage = 2;
      else if (!endTimeStr)  currentStage = 3;
      else                   currentStage = 4;

      // Today's data
      if (dateKey === today) {
        if (arrivalStr) activeDriversToday++;
        if (arrivalStr && !lastDropStr && !endTimeStr && departStr) driversOnRoad++;
        totalDropsToday  += totalDrops;
        failedDropsToday += failedDrops;
        if (duration > 0) shiftDurations.push(duration);

        // Vehicle wait time (arrived but not yet departed)
        var facilityWaitMins = 0;
        if (arrivalStr && !departStr) {
          facilityWaitMins = Math.round((now - arrivalDate) / 60000);
        }

        // Vehicle running time (departed but not last drop)
        var vehRunMins = 0;
        if (departDate && lastDropDate) {
          vehRunMins = Math.round((lastDropDate - departDate) / 60000);
        } else if (departDate && !lastDropDate) {
          vehRunMins = Math.round((now - departDate) / 60000);
        }

        liveOps.push({
          driverId:         driverId,
          driverName:       driverName,
          shiftStartTime:   arrivalStr,
          currentStage:     currentStage,
          vehicle:          vehicle,
          kmSoFar:          gpsKm,
          facilityWaitMins: facilityWaitMins,
          vehRunMins:       vehRunMins,
          hasCompleted:     currentStage === 4
        });

        // Stage timings (today)
        if (arrivalDate || departDate || lastDropDate) {
          stageTimingsToday.push({
            driverName:   driverName,
            s1ToS2Mins:   (arrivalDate && departDate) ? Math.round((departDate - arrivalDate) / 60000) : null,
            s2ToS3Mins:   (departDate && lastDropDate) ? Math.round((lastDropDate - departDate) / 60000) : null,
            s3ToS4Mins:   (lastDropDate && endTimeStr) ? Math.round((parseDubaiDate_(endTimeStr) - lastDropDate) / 60000) : null
          });
        }

        // Helper usage
        if (helperName || helperCompany) {
          if (!helpersByDate[dateKey]) helpersByDate[dateKey] = [];
          var key = helperName + '|' + helperCompany;
          if (!helperCompanySet[dateKey + key]) {
            helperCompanySet[dateKey + key] = true;
            helpersByDate[dateKey].push({ helperName: helperName, company: helperCompany });
          }
        }
      }

      // Punch out misses from yesterday
      if (dateKey === yesterday && arrivalStr && !endTimeStr) {
        punchOutMisses.push({ driverName: driverName, shiftDate: dateKey, stage: currentStage });
      }

      // Monthly aggregation
      if (shiftDate.getMonth() === monthNum && shiftDate.getFullYear() === yearNum) {
        failedByDate[dateKey]        = (failedByDate[dateKey] || 0) + failedDrops;
        totalByDate[dateKey]         = (totalByDate[dateKey] || 0) + totalDrops;
        otByDate[dateKey]            = (otByDate[dateKey] || 0) + ot;
        shiftDurationByDate[dateKey] = (shiftDurationByDate[dateKey] || 0) + duration;

        // Vehicle km
        if (vehicle) {
          if (!vehicleKmByDate[dateKey]) vehicleKmByDate[dateKey] = {};
          vehicleKmByDate[dateKey][vehicle] = (vehicleKmByDate[dateKey][vehicle] || 0) + gpsKm;
        }

        // Vehicle running hours
        var vehHrs = hoursDiff_(departDate, lastDropDate);
        if (vehicle) {
          if (!vehicleHrsByDate[dateKey]) vehicleHrsByDate[dateKey] = {};
          vehicleHrsByDate[dateKey][vehicle] = (vehicleHrsByDate[dateKey][vehicle] || 0) + vehHrs;
        }

        // Driver day analysis
        var ddKey = dateKey + '_' + driverId;
        if (!driverDetailMap[ddKey]) {
          driverDetailMap[ddKey] = {
            date: dateKey, driverName: driverName, shiftDuration: 0,
            overtime: 0, km: 0, totalDrops: 0, failedDrops: 0
          };
        }
        driverDetailMap[ddKey].shiftDuration += duration;
        driverDetailMap[ddKey].overtime       += ot;
        driverDetailMap[ddKey].km             += gpsKm;
        driverDetailMap[ddKey].totalDrops     += totalDrops;
        driverDetailMap[ddKey].failedDrops    += failedDrops;

        // Helper usage for monthly
        if ((helperName || helperCompany) && dateKey !== today) {
          if (!helpersByDate[dateKey]) helpersByDate[dateKey] = [];
          var hKey = helperName + '|' + helperCompany;
          if (!helperCompanySet[dateKey + hKey]) {
            helperCompanySet[dateKey + hKey] = true;
            helpersByDate[dateKey].push({ helperName: helperName, company: helperCompany });
          }
        }
      }
    });

    // Avg shift duration
    var avgShiftDuration = shiftDurations.length > 0
      ? Math.round(shiftDurations.reduce(function(a, b) { return a + b; }, 0) / shiftDurations.length * 100) / 100
      : 0;

    // Failed drop analysis (monthly)
    var failedDates = Object.keys(failedByDate).sort();
    var failedDropAnalysis = failedDates.map(function(d) {
      var total  = totalByDate[d] || 0;
      var failed = failedByDate[d] || 0;
      return {
        date:    d,
        total:   total,
        failed:  failed,
        percent: total > 0 ? Math.round(failed / total * 1000) / 10 : 0,
        drivers: Object.values(driverDetailMap).filter(function(dd) { return dd.date === d; })
          .map(function(dd) { return {
            driverName:  dd.driverName,
            totalDrops:  dd.totalDrops,
            failedDrops: dd.failedDrops,
            percent:     dd.totalDrops > 0 ? Math.round(dd.failedDrops / dd.totalDrops * 1000) / 10 : 0
          }; })
      };
    });

    // Shift trends (monthly)
    var shiftTrend = failedDates.map(function(d) {
      var count = Object.values(driverDetailMap).filter(function(dd) { return dd.date === d; }).length;
      return {
        date:             d,
        avgShiftDuration: count > 0 ? Math.round(shiftDurationByDate[d] / count * 100) / 100 : 0,
        totalOT:          Math.round((otByDate[d] || 0) * 100) / 100
      };
    });

    // Vehicle analysis
    var vehicleAnalysis = {};
    Object.keys(vehicleKmByDate).forEach(function(d) {
      vehicleAnalysis[d] = Object.keys(vehicleKmByDate[d]).map(function(v) {
        return {
          vehicle:    v,
          km:         Math.round(vehicleKmByDate[d][v] * 100) / 100,
          runHours:   Math.round(((vehicleHrsByDate[d] || {})[v] || 0) * 100) / 100
        };
      });
    });

    // Day analysis
    var dayAnalysis = Object.values(driverDetailMap).sort(function(a, b) {
      return b.date.localeCompare(a.date) || a.driverName.localeCompare(b.driverName);
    }).map(function(dd) {
      return {
        date:          dd.date,
        driverName:    dd.driverName,
        shiftDuration: Math.round(dd.shiftDuration * 100) / 100,
        overtime:      Math.round(dd.overtime * 100) / 100,
        km:            Math.round(dd.km * 100) / 100,
        totalDrops:    dd.totalDrops,
        failedDrops:   dd.failedDrops,
        failPercent:   dd.totalDrops > 0 ? Math.round(dd.failedDrops / dd.totalDrops * 1000) / 10 : 0
      };
    });

    // Helper usage (all dates)
    var helperUsage = Object.keys(helpersByDate).sort().map(function(d) {
      return { date: d, helpers: helpersByDate[d], count: helpersByDate[d].length };
    });

    return {
      success:            true,
      activeDriversToday: activeDriversToday,
      driversOnRoad:      driversOnRoad,
      dropsToday: {
        total:   totalDropsToday,
        failed:  failedDropsToday,
        percent: totalDropsToday > 0 ? Math.round(failedDropsToday / totalDropsToday * 1000) / 10 : 0
      },
      avgShiftDuration:   avgShiftDuration,
      punchOutMisses:     punchOutMisses,
      liveOperations:     liveOps,
      failedDropAnalysis: failedDropAnalysis,
      shiftTrend:         shiftTrend,
      vehicleAnalysis:    vehicleAnalysis,
      dayAnalysis:        dayAnalysis,
      stageTimings:       stageTimingsToday,
      helperUsage:        helperUsage
    };
  } catch (err) {
    return { error: err.message };
  }
}

// =============================================================================
// LIVE OPERATIONS (called from admin dashboard for real-time refresh)
// =============================================================================

function getLiveOperations() {
  try {
    var sheet  = getOrCreateAttendanceSheet_();
    var values = getDateRangeValues_(sheet);
    var now    = new Date();
    var today  = Utilities.formatDate(now, TIMEZONE, 'dd/MM/yyyy');
    var ops    = [];

    // Build a map of latest GPS km per driverId from GPS_Tracking sheet
    // This gives real-time km for in-progress shifts (column Z only written at Stage 4)
    var liveKmMap = {};
    try {
      var gpsSheet   = getOrCreateGpsTrackingSheet_();
      var gpsLastRow = gpsSheet.getLastRow();
      if (gpsLastRow >= 2) {
        var gpsVals = gpsSheet.getRange(2, 1, gpsLastRow - 1, 7).getValues();
        gpsVals.forEach(function(gr) {
          var gpsDateVal = gr[6];
          var gpsDate = (gpsDateVal instanceof Date) ? formatDateOnly_(gpsDateVal) : String(gpsDateVal).trim();
          if (gpsDate !== today) return;
          var did = String(gr[0]).trim();
          if (!did) return;
          liveKmMap[did] = Math.max(liveKmMap[did] || 0, Number(gr[5]) || 0);
        });
      }
    } catch (_) {}

    values.forEach(function(row) {
      var shiftDateVal = row[COL.SHIFT_DATE - 1];
      if (!shiftDateVal) return;
      var shiftDate = (shiftDateVal instanceof Date) ? shiftDateVal : parseDubaiDate_(String(shiftDateVal));
      if (!shiftDate || formatDateOnly_(shiftDate) !== today) return;

      var driverId     = String(row[COL.DRIVER_ID - 1]).trim();
      var driverName   = String(row[COL.DRIVER_NAME - 1]).trim();
      var vehicle      = String(row[COL.VEHICLE - 1]).trim();
      var arrivalVal   = row[COL.ARRIVAL - 1];
      var departureVal = row[COL.DEPARTURE - 1];
      var lastDropVal  = row[COL.LAST_DROP - 1];
      var endTimeStr   = cellToDatetimeStr_(row[COL.END_TIME - 1]);
      var gpsKm        = parseFloat(row[COL.GPS_KM - 1]) || 0;

      var arrivalDate = (arrivalVal instanceof Date) ? arrivalVal : parseDubaiDate_(String(arrivalVal));
      var departDate  = (departureVal instanceof Date) ? departureVal : parseDubaiDate_(String(departureVal));
      var lastDrop    = (lastDropVal instanceof Date) ? lastDropVal : parseDubaiDate_(String(lastDropVal));

      if (!arrivalDate) return;

      var currentStage = !departDate ? 1 : !lastDrop ? 2 : !endTimeStr ? 3 : 4;

      // Use live GPS km for in-progress shifts; fall back to column Z for completed shifts
      var kmSoFar = (currentStage < 4 && liveKmMap[driverId] !== undefined)
        ? liveKmMap[driverId]
        : gpsKm;

      var facilityWaitMins = 0;
      if (!departDate) facilityWaitMins = Math.round((now - arrivalDate) / 60000);

      var vehRunMins = 0;
      if (departDate && lastDrop) {
        vehRunMins = Math.round((lastDrop - departDate) / 60000);
      } else if (departDate) {
        vehRunMins = Math.round((now - departDate) / 60000);
      }

      ops.push({
        driverName:       driverName,
        shiftStartTime:   formatDubai_(arrivalDate),
        currentStage:     currentStage,
        vehicle:          vehicle,
        kmSoFar:          kmSoFar,
        facilityWaitMins: facilityWaitMins,
        vehRunMins:       vehRunMins,
        hasCompleted:     currentStage === 4
      });
    });

    return { success: true, operations: ops, asOf: formatDubai_(now) };
  } catch (err) {
    return { error: err.message };
  }
}

// =============================================================================
// GPS TRACKING — Live driver position log
// Sheet "GPS_Tracking": DRIVER_ID | DRIVER_NAME | TIMESTAMP | LAT | LNG | KM_TOTAL | SHIFT_DATE
// =============================================================================

var GPS_TRACKING_SHEET = 'GPS_Tracking';
var GPS_TRACKING_HEADERS = ['DRIVER_ID', 'DRIVER_NAME', 'TIMESTAMP', 'LAT', 'LNG', 'KM_TOTAL', 'SHIFT_DATE', 'SHIFT_ROW_ID'];

function getOrCreateGpsTrackingSheet_() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(GPS_TRACKING_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(GPS_TRACKING_SHEET);
    var hdr = sheet.getRange(1, 1, 1, GPS_TRACKING_HEADERS.length);
    hdr.setValues([GPS_TRACKING_HEADERS]);
    hdr.setBackground('#37474F');
    hdr.setFontColor('#FFFFFF');
    hdr.setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// data: { driverId, driverName, lat, lng, kmTotal }
function saveGpsPoint(data) {
  try {
    var sheet     = getOrCreateGpsTrackingSheet_();
    var now       = new Date();
    var shiftDate = formatDateOnly_(now);
    sheet.appendRow([
      data.driverId || '',
      data.driverName || '',
      formatDubai_(now),
      Number(data.lat) || 0,
      Number(data.lng) || 0,
      Math.round(Number(data.kmTotal) * 100) / 100 || 0,
      shiftDate,
      data.shiftRowId || ''
    ]);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Returns the latest GPS point for each driver active today
function getActiveDriversLive() {
  try {
    var sheet   = getOrCreateGpsTrackingSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: true, drivers: [] };

    var today  = formatDateOnly_(new Date());
    var values = sheet.getRange(2, 1, lastRow - 1, 8).getValues();

    var latestByDriver = {};
    values.forEach(function(row) {
      // Sheets may auto-convert the date string to a Date object — handle both cases
      var shiftDateVal = row[6];
      var shiftDate = (shiftDateVal instanceof Date)
        ? formatDateOnly_(shiftDateVal)
        : String(shiftDateVal).trim();
      if (shiftDate !== today) return;
      var driverId = String(row[0]).trim();
      if (!driverId) return;
      // Keep the last (most recent) entry per driver (rows appended in order)
      latestByDriver[driverId] = {
        driverId:   driverId,
        driverName: String(row[1]).trim(),
        timestamp:  (row[2] instanceof Date) ? formatDubai_(row[2]) : String(row[2]).trim(),
        lat:        Number(row[3]),
        lng:        Number(row[4]),
        kmTotal:    Number(row[5]),
        shiftRowId: String(row[7]).trim()
      };
    });

    return { success: true, drivers: Object.values(latestByDriver) };
  } catch (err) {
    return { error: err.message };
  }
}

// Returns all GPS points for a specific driver on a specific date (dd/MM/yyyy or YYYY-MM-DD)
// Optional shiftRowId filters to a single shift (when a driver runs multiple shifts per day)
function getDriverRoute(driverId, dateStr, shiftRowId) {
  try {
    var sheet   = getOrCreateGpsTrackingSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: true, points: [] };

    // Normalise dateStr
    var targetDate = dateStr || formatDateOnly_(new Date());
    if (targetDate && targetDate.indexOf('-') !== -1) {
      var dp = targetDate.split('-');
      targetDate = dp[2] + '/' + dp[1] + '/' + dp[0];
    }

    var values = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
    var points = [];
    values.forEach(function(row) {
      if (String(row[0]).trim() !== driverId) return;
      // Sheets may auto-convert the date string to a Date object — handle both cases
      var shiftDateVal = row[6];
      var rowDate = (shiftDateVal instanceof Date)
        ? formatDateOnly_(shiftDateVal)
        : String(shiftDateVal).trim();
      if (rowDate !== targetDate) return;
      // If shiftRowId provided, only include points from that shift
      if (shiftRowId && String(row[7]).trim() && String(row[7]).trim() !== String(shiftRowId)) return;
      var ts = (row[2] instanceof Date) ? formatDubai_(row[2]) : String(row[2]).trim();
      points.push({ timestamp: ts, lat: Number(row[3]), lng: Number(row[4]), km: Number(row[5]) });
    });

    return { success: true, driverId: driverId, date: targetDate, points: points };
  } catch (err) {
    return { error: err.message };
  }
}

// =============================================================================
// WEB ADMIN DASHBOARD HTML
// Served when the GAS URL is opened in a browser with no ?action= param
// =============================================================================

function getAdminHtml_() {
  var gasUrl = ScriptApp.getService().getUrl();
  return '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'  <meta charset="UTF-8">\n' +
'  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'  <title>RSA Driver Pilot — Admin Dashboard</title>\n' +
'  <style>\n' +
'    * { box-sizing: border-box; margin: 0; padding: 0; }\n' +
'    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #F5F7FA; color: #1A1A2E; }\n' +
'    #login-screen { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; }\n' +
'    .login-card { background: #fff; border-radius: 16px; padding: 40px; width: 340px; box-shadow: 0 4px 24px rgba(0,0,0,0.10); }\n' +
'    .login-card h1 { font-size: 22px; font-weight: 800; color: #0D47A1; margin-bottom: 8px; }\n' +
'    .login-card p { color: #666; font-size: 13px; margin-bottom: 24px; }\n' +
'    .login-card input { width: 100%; border: 1.5px solid #DDD; border-radius: 8px; padding: 12px 14px; font-size: 15px; margin-bottom: 14px; }\n' +
'    .login-card button { width: 100%; background: #0D47A1; color: #fff; border: none; border-radius: 8px; padding: 14px; font-size: 16px; font-weight: 700; cursor: pointer; }\n' +
'    .login-card .err { color: #C62828; font-size: 13px; margin-top: 10px; }\n' +
'    #dashboard { display: none; }\n' +
'    .topbar { background: #0D47A1; color: #fff; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; }\n' +
'    .topbar h1 { font-size: 18px; font-weight: 800; }\n' +
'    .topbar button { background: rgba(255,255,255,0.2); color: #fff; border: none; border-radius: 6px; padding: 8px 14px; cursor: pointer; font-size: 13px; }\n' +
'    .tabs { display: flex; gap: 4px; background: #fff; padding: 12px 24px; border-bottom: 1px solid #EEE; overflow-x: auto; }\n' +
'    .tab { padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; color: #666; white-space: nowrap; }\n' +
'    .tab.active { background: #0D47A1; color: #fff; }\n' +
'    .panel { display: none; padding: 24px; }\n' +
'    .panel.active { display: block; }\n' +
'    .cards { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }\n' +
'    .card { background: #fff; border-radius: 12px; padding: 18px 22px; flex: 1; min-width: 160px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }\n' +
'    .card .val { font-size: 28px; font-weight: 900; color: #0D47A1; }\n' +
'    .card .lbl { font-size: 12px; color: #888; margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }\n' +
'    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }\n' +
'    th { background: #E8EEF7; color: #0D47A1; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 14px; text-align: left; }\n' +
'    td { padding: 10px 14px; font-size: 13px; border-bottom: 1px solid #F0F0F0; }\n' +
'    tr:last-child td { border-bottom: none; }\n' +
'    tr:nth-child(even) td { background: #FAFAFA; }\n' +
'    .stage-pill { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }\n' +
'    .s1 { background: #E3F2FD; color: #1565C0; }\n' +
'    .s2 { background: #F3E5F5; color: #6A1B9A; }\n' +
'    .s3 { background: #FFF8E1; color: #F57F17; }\n' +
'    .s4 { background: #E8F5E9; color: #2E7D32; }\n' +
'    .section-title { font-size: 12px; font-weight: 800; color: #888; text-transform: uppercase; letter-spacing: 0.8px; margin: 20px 0 10px; }\n' +
'    .refresh-row { display: flex; justify-content: flex-end; margin-bottom: 12px; }\n' +
'    .refresh-btn { background: #E8EEF7; border: none; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-size: 13px; font-weight: 600; color: #0D47A1; }\n' +
'    .as-of { color: #888; font-size: 12px; margin-left: 12px; }\n' +
'    #map-container { width: 100%; height: 520px; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }\n' +
'    .map-filter-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; align-items: center; }\n' +
'    .map-chip { padding: 6px 14px; border-radius: 16px; border: 1.5px solid #DDD; background: #fff; color: #555; cursor: pointer; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }\n' +
'    .map-chip.all-active { background: #0D47A1; border-color: #0D47A1; color: #fff; }\n' +
'    .map-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }\n' +
'    .map-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }\n' +
'    @media (max-width: 600px) { .cards { flex-direction: column; } .panel { padding: 12px; } #map-container { height: 360px; } }\n' +
'    .spinner { display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,0.4); border-radius:50%; border-top-color:#fff; animation:spin 0.7s linear infinite; vertical-align:middle; margin-right:6px; }\n' +
'    @keyframes spin { to { transform:rotate(360deg); } }\n' +
'  </style>\n' +
'</head>\n' +
'<body>\n' +
'\n' +
'<!-- Login Screen -->\n' +
'<div id="login-screen">\n' +
'  <div class="login-card">\n' +
'    <h1>RSA Admin Dashboard</h1>\n' +
'    <p>Sign in with your Admin credentials</p>\n' +
'    <input id="l-uid" placeholder="User ID" />\n' +
'    <input id="l-pw" type="password" placeholder="Password" />\n' +
'    <button onclick="doLogin()">Sign In</button>\n' +
'    <div class="err" id="l-err"></div>\n' +
'  </div>\n' +
'</div>\n' +
'\n' +
'<!-- Dashboard -->\n' +
'<div id="dashboard">\n' +
'  <div class="topbar">\n' +
'    <h1>RSA Admin Dashboard</h1>\n' +
'    <div>\n' +
'      <span id="topbar-date" style="font-size:13px;margin-right:12px;opacity:0.8"></span>\n' +
'      <button onclick="doLogout()">Logout</button>\n' +
'    </div>\n' +
'  </div>\n' +
'  <div class="tabs">\n' +
'    <div class="tab active" onclick="showTab(0)">Live Ops</div>\n' +
'    <div class="tab" onclick="showTab(1)">Failed Drops</div>\n' +
'    <div class="tab" onclick="showTab(2)">Shift Trends</div>\n' +
'    <div class="tab" onclick="showTab(3)">Vehicles</div>\n' +
'    <div class="tab" onclick="showTab(4)">Day Analysis</div>\n' +
'    <div class="tab" onclick="showTab(5)">Stage Timings</div>\n' +
'    <div class="tab" onclick="showTab(6)">Helpers</div>\n' +
'    <div class="tab" onclick="showTab(7)">🗺 Live Map</div>\n' +
'  </div>\n' +
'\n' +
'  <!-- Tab 0: Live Ops -->\n' +
'  <div class="panel active" id="panel-0">\n' +
'    <div class="refresh-row">\n' +
'      <button class="refresh-btn" onclick="loadDashboard()">&#8635; Refresh</button>\n' +
'      <span class="as-of" id="asof-live"></span>\n' +
'    </div>\n' +
'    <div class="cards" id="live-cards"></div>\n' +
'    <div class="section-title">Live Driver Status</div>\n' +
'    <table><thead><tr><th>Driver</th><th>Stage</th><th>Vehicle</th><th>KM So Far</th><th>Shift Start</th><th>Wait / Run (mins)</th></tr></thead><tbody id="live-table"></tbody></table>\n' +
'    <div class="section-title" style="margin-top:24px">Punch-Out Misses (Yesterday)</div>\n' +
'    <table><thead><tr><th>Driver</th><th>Shift Date</th><th>Last Stage</th></tr></thead><tbody id="miss-table"></tbody></table>\n' +
'  </div>\n' +
'\n' +
'  <!-- Tab 1: Failed Drops -->\n' +
'  <div class="panel" id="panel-1">\n' +
'    <div class="section-title">Failed Drop Analysis (This Month)</div>\n' +
'    <table><thead><tr><th>Date</th><th>Total Drops</th><th>Failed</th><th>Fail %</th></tr></thead><tbody id="failed-table"></tbody></table>\n' +
'  </div>\n' +
'\n' +
'  <!-- Tab 2: Shift Trends -->\n' +
'  <div class="panel" id="panel-2">\n' +
'    <div class="section-title">Shift Trends (This Month)</div>\n' +
'    <table><thead><tr><th>Date</th><th>Avg Shift Duration (hrs)</th><th>Total OT (hrs)</th></tr></thead><tbody id="trend-table"></tbody></table>\n' +
'  </div>\n' +
'\n' +
'  <!-- Tab 3: Vehicles -->\n' +
'  <div class="panel" id="panel-3">\n' +
'    <div class="section-title">Vehicle Analysis — Today</div>\n' +
'    <table><thead><tr><th>Vehicle</th><th>KM Driven</th><th>Run Hours</th></tr></thead><tbody id="vehicle-table"></tbody></table>\n' +
'  </div>\n' +
'\n' +
'  <!-- Tab 4: Day Analysis -->\n' +
'  <div class="panel" id="panel-4">\n' +
'    <div class="section-title">Day-Level Driver Analysis (This Month)</div>\n' +
'    <table><thead><tr><th>Date</th><th>Driver</th><th>Duration (hrs)</th><th>OT (hrs)</th><th>KM</th><th>Drops</th><th>Failed</th><th>Fail%</th></tr></thead><tbody id="day-table"></tbody></table>\n' +
'  </div>\n' +
'\n' +
'  <!-- Tab 5: Stage Timings -->\n' +
'  <div class="panel" id="panel-5">\n' +
'    <div class="section-title">Stage Timings — Today</div>\n' +
'    <table><thead><tr><th>Driver</th><th>S1→S2 (min)</th><th>S2→S3 (min)</th><th>S3→S4 (min)</th></tr></thead><tbody id="timing-table"></tbody></table>\n' +
'  </div>\n' +
'\n' +
'  <!-- Tab 6: Helpers -->\n' +
'  <div class="panel" id="panel-6">\n' +
'    <div class="section-title">Helper Usage (This Month)</div>\n' +
'    <table><thead><tr><th>Date</th><th>Helper Count</th><th>Names / Companies</th></tr></thead><tbody id="helper-table"></tbody></table>\n' +
'  </div>\n' +
'\n' +
'  <!-- Tab 7: Live Map -->\n' +
'  <div class="panel" id="panel-7">\n' +
'    <div class="map-filter-bar" id="map-filter-bar">\n' +
'      <button class="map-chip all-active" onclick="selectMapDriver(null)">All Drivers</button>\n' +
'    </div>\n' +
'    <div class="map-meta">\n' +
'      <span id="map-last-update" style="font-size:12px;color:#888"></span>\n' +
'      <button class="refresh-btn" onclick="loadMapData()">&#8635; Refresh</button>\n' +
'    </div>\n' +
'    <div id="map-container"></div>\n' +
'  </div>\n' +
'</div>\n' +
'\n' +
'<script>\n' +
'  var GAS_URL  = "' + gasUrl + '";\n' +
'  var MAPS_KEY = "' + GOOGLE_MAPS_API_KEY + '";\n' +
'  var adminPass = "";\n' +
'  var adminId   = "";\n' +
'\n' +
'  // Restore session from localStorage on page load\n' +
'  (function() {\n' +
'    var sid = localStorage.getItem("rsa_admin_id");\n' +
'    var spw = localStorage.getItem("rsa_admin_pw");\n' +
'    if (sid && spw) {\n' +
'      adminId = sid; adminPass = spw;\n' +
'      document.getElementById("login-screen").style.display = "none";\n' +
'      document.getElementById("dashboard").style.display    = "block";\n' +
'      document.getElementById("topbar-date").textContent    = new Date().toLocaleDateString("en-GB");\n' +
'      loadDashboard();\n' +
'    }\n' +
'  })();\n' +
'\n' +
'  function doLogin() {\n' +
'    var uid = document.getElementById("l-uid").value.trim();\n' +
'    var pw  = document.getElementById("l-pw").value.trim();\n' +
'    if (!uid || !pw) { document.getElementById("l-err").textContent = "Enter User ID and Password."; return; }\n' +
'    document.getElementById("l-err").textContent = "";\n' +
'    var btn = document.querySelector(".login-card button");\n' +
'    btn.disabled = true;\n' +
'    btn.innerHTML = \'<span class="spinner"></span>Signing in\u2026\';\n' +
'    fetch(GAS_URL + "?action=authenticateUser&userId=" + encodeURIComponent(uid) + "&password=" + encodeURIComponent(pw))\n' +
'      .then(function(r) { return r.json(); })\n' +
'      .then(function(d) {\n' +
'        if (!d.success) { document.getElementById("l-err").textContent = d.error || "Login failed."; return; }\n' +
'        if (!d.isAdmin) { document.getElementById("l-err").textContent = "Admin access only."; return; }\n' +
'        adminId   = uid;\n' +
'        adminPass = pw;\n' +
'        localStorage.setItem("rsa_admin_id", uid);\n' +
'        localStorage.setItem("rsa_admin_pw", pw);\n' +
'        document.getElementById("login-screen").style.display = "none";\n' +
'        document.getElementById("dashboard").style.display    = "block";\n' +
'        document.getElementById("topbar-date").textContent    = new Date().toLocaleDateString("en-GB");\n' +
'        loadDashboard();\n' +
'      })\n' +
'      .catch(function() { document.getElementById("l-err").textContent = "Network error."; })\n' +
'      .finally(function() { btn.disabled = false; btn.innerHTML = "Sign In"; });\n' +
'  }\n' +
'\n' +
'  function doLogout() {\n' +
'    adminId = ""; adminPass = "";\n' +
'    localStorage.removeItem("rsa_admin_id");\n' +
'    localStorage.removeItem("rsa_admin_pw");\n' +
'    document.getElementById("dashboard").style.display    = "none";\n' +
'    document.getElementById("login-screen").style.display = "flex";\n' +
'  }\n' +
'\n' +
'  function showTab(n) {\n' +
'    document.querySelectorAll(".tab").forEach(function(t, i) { t.classList.toggle("active", i === n); });\n' +
'    document.querySelectorAll(".panel").forEach(function(p, i) { p.classList.toggle("active", i === n); });\n' +
'    if (n === 7) {\n' +
'      mapFirstFitDone = false;\n' +
'      if (window.google && window.google.maps) {\n' +
'        if (!googleMap) initMap(); else loadMapData();\n' +
'      } else {\n' +
'        loadGoogleMapsScript();\n' +
'      }\n' +
'      startMapAutoRefresh();\n' +
'    } else {\n' +
'      stopMapAutoRefresh();\n' +
'    }\n' +
'  }\n' +
'\n' +
'  function loadDashboard() {\n' +
'    fetch(GAS_URL + "?action=getAdminDashboard")\n' +
'      .then(function(r) { return r.json(); })\n' +
'      .then(function(d) { renderAll(d); })\n' +
'      .catch(function(e) { console.error(e); });\n' +
'  }\n' +
'\n' +
'  function stagePill(s) {\n' +
'    var labels = ["—", "S1: Arrived", "S2: On Road", "S3: Last Drop", "S4: Done"];\n' +
'    var cls    = ["", "s1", "s2", "s3", "s4"];\n' +
'    return \'<span class="stage-pill \' + (cls[s]||"") + \'">\' + (labels[s]||s) + \'</span>\';\n' +
'  }\n' +
'\n' +
'  function renderAll(d) {\n' +
'    if (!d || d.error) { console.error("Dashboard error:", d && d.error); return; }\n' +
'\n' +
'    // Live cards\n' +
'    document.getElementById("live-cards").innerHTML =\n' +
'      card("Active Drivers", d.activeDriversToday) +\n' +
'      card("On Road", d.driversOnRoad) +\n' +
'      card("Total Drops Today", d.dropsToday && d.dropsToday.total) +\n' +
'      card("Failed Drops Today", d.dropsToday && d.dropsToday.failed) +\n' +
'      card("Punch-Out Misses", d.punchOutMisses && d.punchOutMisses.length);\n' +
'\n' +
'    // Live table\n' +
'    var liveHtml = "";\n' +
'    (d.liveOperations || []).forEach(function(op) {\n' +
'      liveHtml += "<tr><td>" + op.driverName + "</td><td>" + stagePill(op.currentStage) + "</td><td>" +\n' +
'        op.vehicle + "</td><td>" + op.kmSoFar.toFixed(1) + " km</td><td>" + op.shiftStartTime +\n' +
'        "</td><td>W:" + op.facilityWaitMins + " / R:" + op.vehRunMins + "</td></tr>";\n' +
'    });\n' +
'    document.getElementById("live-table").innerHTML = liveHtml || "<tr><td colspan=6 style=text-align:center;color:#aaa>No active drivers today</td></tr>";\n' +
'\n' +
'    // Punch-out misses\n' +
'    var missHtml = "";\n' +
'    (d.punchOutMisses || []).forEach(function(m) {\n' +
'      missHtml += "<tr><td>" + m.driverName + "</td><td>" + m.shiftDate + "</td><td>" + stagePill(m.stage) + "</td></tr>";\n' +
'    });\n' +
'    document.getElementById("miss-table").innerHTML = missHtml || "<tr><td colspan=3 style=text-align:center;color:#aaa>None</td></tr>";\n' +
'\n' +
'    // Failed drops\n' +
'    var failHtml = "";\n' +
'    (d.failedDropAnalysis || []).forEach(function(r) {\n' +
'      failHtml += "<tr><td>" + r.date + "</td><td>" + r.total + "</td><td>" + r.failed + "</td><td>" + r.percent + "%</td></tr>";\n' +
'    });\n' +
'    document.getElementById("failed-table").innerHTML = failHtml || "<tr><td colspan=4 style=text-align:center;color:#aaa>No data</td></tr>";\n' +
'\n' +
'    // Shift trend\n' +
'    var trendHtml = "";\n' +
'    (d.shiftTrend || []).forEach(function(r) {\n' +
'      trendHtml += "<tr><td>" + r.date + "</td><td>" + r.avgShiftDuration + " hrs</td><td>" + r.totalOT + " hrs</td></tr>";\n' +
'    });\n' +
'    document.getElementById("trend-table").innerHTML = trendHtml || "<tr><td colspan=3 style=text-align:center;color:#aaa>No data</td></tr>";\n' +
'\n' +
'    // Vehicle analysis (today)\n' +
'    var todayStr = new Date().toLocaleDateString("en-GB").split("/").reverse().join("/").replace(/\\//g, "/");\n' +
'    var todayKey = Object.keys(d.vehicleAnalysis || {}).sort().pop();\n' +
'    var vehHtml  = "";\n' +
'    ((d.vehicleAnalysis || {})[todayKey] || []).forEach(function(v) {\n' +
'      vehHtml += "<tr><td>" + v.vehicle + "</td><td>" + v.km + " km</td><td>" + v.runHours + " hrs</td></tr>";\n' +
'    });\n' +
'    document.getElementById("vehicle-table").innerHTML = vehHtml || "<tr><td colspan=3 style=text-align:center;color:#aaa>No data for today</td></tr>";\n' +
'\n' +
'    // Day analysis\n' +
'    var dayHtml = "";\n' +
'    (d.dayAnalysis || []).forEach(function(r) {\n' +
'      dayHtml += "<tr><td>" + r.date + "</td><td>" + r.driverName + "</td><td>" + r.shiftDuration + "</td><td>" +\n' +
'        r.overtime + "</td><td>" + r.km + "</td><td>" + r.totalDrops + "</td><td>" + r.failedDrops + "</td><td>" + r.failPercent + "%</td></tr>";\n' +
'    });\n' +
'    document.getElementById("day-table").innerHTML = dayHtml || "<tr><td colspan=8 style=text-align:center;color:#aaa>No data</td></tr>";\n' +
'\n' +
'    // Stage timings\n' +
'    var timingHtml = "";\n' +
'    (d.stageTimings || []).forEach(function(r) {\n' +
'      timingHtml += "<tr><td>" + r.driverName + "</td><td>" + (r.s1ToS2Mins !== null ? r.s1ToS2Mins : "—") +\n' +
'        "</td><td>" + (r.s2ToS3Mins !== null ? r.s2ToS3Mins : "—") +\n' +
'        "</td><td>" + (r.s3ToS4Mins !== null ? r.s3ToS4Mins : "—") + "</td></tr>";\n' +
'    });\n' +
'    document.getElementById("timing-table").innerHTML = timingHtml || "<tr><td colspan=4 style=text-align:center;color:#aaa>No data</td></tr>";\n' +
'\n' +
'    // Helpers\n' +
'    var helperHtml = "";\n' +
'    (d.helperUsage || []).forEach(function(r) {\n' +
'      var names = (r.helpers || []).map(function(h) { return h.helperName + (h.company ? " (" + h.company + ")" : ""); }).join(", ");\n' +
'      helperHtml += "<tr><td>" + r.date + "</td><td>" + r.count + "</td><td>" + names + "</td></tr>";\n' +
'    });\n' +
'    document.getElementById("helper-table").innerHTML = helperHtml || "<tr><td colspan=3 style=text-align:center;color:#aaa>No data</td></tr>";\n' +
'  }\n' +
'\n' +
'  function card(label, value) {\n' +
'    return \'<div class="card"><div class="val">\' + (value !== undefined && value !== null ? value : "—") + \'</div><div class="lbl">\' + label + \'</div></div>\';\n' +
'  }\n' +
'\n' +
'  // =============================================================\n' +
'  // Live Map\n' +
'  // =============================================================\n' +
'  var googleMap      = null;\n' +
'  var mapMarkers     = {};\n' +
'  var mapPolylines   = {};\n' +
'  var mapDriversData = [];\n' +
'  var mapRouteData   = {};\n' +
'  var mapSelectedId  = null;\n' +
'  var mapColorMap    = {};\n' +
'  var mapInterval    = null;\n' +
'  var mapApiLoading  = false;\n' +
'  var mapFirstFitDone = false;\n' +
'  var MAP_COLORS = ["#E53935","#7B1FA2","#00897B","#F57C00","#0288D1","#558B2F","#AD1457","#795548"];\n' +
'  var FACILITY_LAT = 24.903892;\n' +
'  var FACILITY_LNG = 55.114065;\n' +
'\n' +
'  function getMapColor(driverId) {\n' +
'    if (!mapColorMap[driverId]) {\n' +
'      var idx = Object.keys(mapColorMap).length;\n' +
'      mapColorMap[driverId] = MAP_COLORS[idx % MAP_COLORS.length];\n' +
'    }\n' +
'    return mapColorMap[driverId];\n' +
'  }\n' +
'\n' +
'  function filterRouteOutliers(points) {\n' +
'    if (points.length < 2) return points;\n' +
'    var R = 6371000;\n' +
'    var filtered = [points[0]];\n' +
'    for (var i = 1; i < points.length; i++) {\n' +
'      var prev = filtered[filtered.length - 1];\n' +
'      var dLat = (points[i].lat - prev.lat) * Math.PI / 180;\n' +
'      var dLng = (points[i].lng - prev.lng) * Math.PI / 180;\n' +
'      var a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(prev.lat*Math.PI/180)*Math.cos(points[i].lat*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);\n' +
'      var dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));\n' +
'      if (dist < 2000) filtered.push(points[i]);\n' +
'    }\n' +
'    return filtered;\n' +
'  }\n' +
'\n' +
'  function loadGoogleMapsScript() {\n' +
'    if (mapApiLoading) return;\n' +
'    mapApiLoading = true;\n' +
'    var s = document.createElement("script");\n' +
'    s.src = "https://maps.googleapis.com/maps/api/js?key=" + MAPS_KEY + "&callback=initMap";\n' +
'    s.async = true; s.defer = true;\n' +
'    document.head.appendChild(s);\n' +
'  }\n' +
'\n' +
'  function initMap() {\n' +
'    mapApiLoading = false;\n' +
'    googleMap = new google.maps.Map(document.getElementById("map-container"), {\n' +
'      zoom: 11,\n' +
'      center: { lat: FACILITY_LAT, lng: FACILITY_LNG },\n' +
'      mapTypeId: "roadmap",\n' +
'    });\n' +
'    new google.maps.Marker({\n' +
'      position: { lat: FACILITY_LAT, lng: FACILITY_LNG },\n' +
'      map: googleMap,\n' +
'      title: "RSA Facility",\n' +
'      icon: { url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(\'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 52" width="48" height="52"><text x="50%" y="46" dominant-baseline="middle" text-anchor="middle" font-size="40">\\uD83C\\uDFE0</text></svg>\'), scaledSize: new google.maps.Size(48, 52), anchor: new google.maps.Point(24, 52) },\n' +
'      zIndex: 100,\n' +
'    });\n' +
'    loadMapData();\n' +
'  }\n' +
'\n' +
'  function loadMapData() {\n' +
'    var today = new Date().toISOString().slice(0, 10);\n' +
'    fetch(GAS_URL + "?action=getActiveDriversLive")\n' +
'      .then(function(r) { return r.json(); })\n' +
'      .then(function(result) {\n' +
'        if (!result.success) return;\n' +
'        mapDriversData = result.drivers || [];\n' +
'        var promises = mapDriversData.map(function(d) {\n' +
'          return fetch(GAS_URL + "?action=getDriverRoute&driverId=" + encodeURIComponent(d.driverId) + "&date=" + encodeURIComponent(today) + (d.shiftRowId ? "&shiftRowId=" + encodeURIComponent(d.shiftRowId) : ""))\n' +
'            .then(function(r) { return r.json(); })\n' +
'            .then(function(r) { return { driverId: d.driverId, points: r.points || [] }; })\n' +
'            .catch(function() { return { driverId: d.driverId, points: [] }; });\n' +
'        });\n' +
'        Promise.all(promises).then(function(routes) {\n' +
'          routes.forEach(function(r) { mapRouteData[r.driverId] = r.points; });\n' +
'          renderMap();\n' +
'          if (!mapFirstFitDone) { fitMapToBounds(); mapFirstFitDone = true; }\n' +
'          document.getElementById("map-last-update").textContent = "Updated " + new Date().toLocaleTimeString("en-GB");\n' +
'        });\n' +
'      })\n' +
'      .catch(function(e) { console.error("Map error:", e); });\n' +
'  }\n' +
'\n' +
'  function renderMap() {\n' +
'    if (!googleMap) return;\n' +
'    Object.values(mapMarkers).forEach(function(m) { m.setMap(null); });\n' +
'    Object.values(mapPolylines).forEach(function(p) { p.setMap(null); });\n' +
'    mapMarkers = {}; mapPolylines = {};\n' +
'    var display = mapSelectedId\n' +
'      ? mapDriversData.filter(function(d) { return d.driverId === mapSelectedId; })\n' +
'      : mapDriversData;\n' +
'    var bounds = new google.maps.LatLngBounds();\n' +
'    bounds.extend({ lat: FACILITY_LAT, lng: FACILITY_LNG });\n' +
'    display.forEach(function(d) {\n' +
'      var color = getMapColor(d.driverId);\n' +
'      var rawPts = (mapRouteData[d.driverId] || []).map(function(p) { return { lat: p.lat, lng: p.lng }; });\n' +
'      var pts = filterRouteOutliers(rawPts);\n' +
'      if (pts.length >= 2) {\n' +
'        mapPolylines[d.driverId] = new google.maps.Polyline({\n' +
'          path: pts, geodesic: true,\n' +
'          strokeColor: color, strokeOpacity: 1.0, strokeWeight: 3, map: googleMap,\n' +
'        });\n' +
'        pts.forEach(function(p) { bounds.extend(p); });\n' +
'      }\n' +
'      if (d.lat && d.lng) {\n' +
'        var stageNames = ["","At Facility","On Road","Last Drop Done","Shift Complete"];\n' +
'        var iwContent = "<div style=\\"padding:8px;min-width:190px;font-family:sans-serif\\">" +\n' +
'          "<strong style=\\"font-size:14px\\">" + d.driverName + "</strong><br>" +\n' +
'          "\\uD83D\\uDE9A " + (d.vehicle || "—") + "<br>" +\n' +
'          "\\uD83D\\uDCCD " + d.kmTotal.toFixed(1) + " km<br>" +\n' +
'          "\\uD83D\\uDD50 <span style=\\"color:#888;font-size:11px\\">" + d.timestamp + "</span></div>";\n' +
'        var iw = new google.maps.InfoWindow({ content: iwContent });\n' +
'        var truckSvg = \'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="19" fill="\' + color + \'" stroke="#fff" stroke-width="2"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="20">\\uD83D\\uDE9A</text></svg>\';\n' +
'        var marker = new google.maps.Marker({\n' +
'          position: { lat: d.lat, lng: d.lng },\n' +
'          map: googleMap, title: d.driverName,\n' +
'          icon: { url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(truckSvg), scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 20) },\n' +
'          zIndex: 200,\n' +
'        });\n' +
'        (function(mk, iwin) { mk.addListener("click", function() { iwin.open(googleMap, mk); }); })(marker, iw);\n' +
'        mapMarkers[d.driverId] = marker;\n' +
'        bounds.extend({ lat: d.lat, lng: d.lng });\n' +
'      }\n' +
'    });\n' +
'    renderMapFilterBar();\n' +
'  }\n' +
'\n' +
'  function fitMapToBounds() {\n' +
'    if (!googleMap) return;\n' +
'    var display = mapSelectedId\n' +
'      ? mapDriversData.filter(function(d) { return d.driverId === mapSelectedId; })\n' +
'      : mapDriversData;\n' +
'    var bounds = new google.maps.LatLngBounds();\n' +
'    bounds.extend({ lat: FACILITY_LAT, lng: FACILITY_LNG });\n' +
'    display.forEach(function(d) {\n' +
'      var pts = (mapRouteData[d.driverId] || []).map(function(p) { return { lat: p.lat, lng: p.lng }; });\n' +
'      pts.forEach(function(p) { bounds.extend(p); });\n' +
'      if (d.lat && d.lng) bounds.extend({ lat: d.lat, lng: d.lng });\n' +
'    });\n' +
'    if (!bounds.isEmpty()) googleMap.fitBounds(bounds, { top: 60, right: 40, bottom: 40, left: 40 });\n' +
'  }\n' +
'\n' +
'  function renderMapFilterBar() {\n' +
'    var html = "<button class=\\"map-chip" + (!mapSelectedId ? " all-active" : "") + "\\" data-idx=\\"-1\\">All Drivers</button> ";\n' +
'    for (var i = 0; i < mapDriversData.length; i++) {\n' +
'      var d = mapDriversData[i];\n' +
'      var color = getMapColor(d.driverId);\n' +
'      var active = mapSelectedId === d.driverId;\n' +
'      html += "<button class=\\"map-chip\\" data-idx=\\"" + i + "\\" style=\\"border-color:" + color +\n' +
'        ";background:" + (active ? color : "#fff") + ";color:" + (active ? "#fff" : "#555") + "\\">" +\n' +
'        "<span class=\\"map-dot\\" style=\\"background:" + color + "\\"></span>" +\n' +
'        d.driverName + (d.vehicle ? " &middot; " + d.vehicle : "") + "</button> ";\n' +
'    }\n' +
'    var bar = document.getElementById("map-filter-bar");\n' +
'    bar.innerHTML = html;\n' +
'    bar.onclick = function(e) {\n' +
'      var btn = e.target.closest("[data-idx]");\n' +
'      if (!btn) return;\n' +
'      var idx = parseInt(btn.getAttribute("data-idx"));\n' +
'      if (idx < 0) { mapSelectedId = null; }\n' +
'      else { var dr = mapDriversData[idx]; mapSelectedId = dr ? dr.driverId : null; }\n' +
'      renderMap(); fitMapToBounds();\n' +
'    };\n' +
'  }\n' +
'\n' +
'  function selectMapDriver(id) { mapSelectedId = id; renderMap(); fitMapToBounds(); }\n' +
'\n' +
'  function startMapAutoRefresh() {\n' +
'    if (mapInterval) clearInterval(mapInterval);\n' +
'    mapInterval = setInterval(function() { if (googleMap) loadMapData(); }, 15000);\n' +
'  }\n' +
'  function stopMapAutoRefresh() {\n' +
'    if (mapInterval) { clearInterval(mapInterval); mapInterval = null; }\n' +
'  }\n' +
'\n' +
'  // Allow pressing Enter on password field to trigger login\n' +
'  document.getElementById("l-pw").addEventListener("keydown", function(e) { if (e.key === "Enter") doLogin(); });\n' +
'  document.getElementById("l-uid").addEventListener("keydown", function(e) { if (e.key === "Enter") doLogin(); });\n' +
'</script>\n' +
'</body>\n' +
'</html>';
}
