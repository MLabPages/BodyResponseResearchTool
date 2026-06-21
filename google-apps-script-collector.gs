function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const payload = JSON.parse(e.postData.contents);
  const rows = payload.rows || [];

  if (rows.length === 0) {
    return ContentService.createTextOutput("no rows");
  }

  const headers = Object.keys(rows[0]);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["received_at", "file_name"].concat(headers));
  }

  const receivedAt = new Date();
  const values = rows.map(function (row) {
    return [receivedAt, payload.fileName || ""].concat(
      headers.map(function (key) {
        return row[key];
      }),
    );
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);

  return ContentService.createTextOutput("ok");
}
