'use strict';

const QRCode = require('qrcode');

const options = (size) => ({
  width: size,
  margin: 1,
  errorCorrectionLevel: 'M',
  color: { dark: '#0f172a', light: '#ffffff' },
});

const toDataUrl = (text, size = 320) => QRCode.toDataURL(text, options(size));
const toBuffer = (text, size = 320) => QRCode.toBuffer(text, options(size));

module.exports = { toDataUrl, toBuffer };
