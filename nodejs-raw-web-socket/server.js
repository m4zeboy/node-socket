import crypto from 'node:crypto';
import { createServer } from 'node:http';
const PORT = 1337;
const WEBSOCKET_MAGIC_STRING_KEY = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const SEVEN_BITS_INTEGER_MARKER = 125;
const SIXTEEN_BITS_INTEGER_MARKER = 126;
const SIXTYFOUR_BITS_INTEGER_MARKER = 127;

const MASK_KEY_BYTES_LENGTH = 4;
//parseInt('10000000', 2)
const FIRST_BIT = 128;

const server = createServer((request, response) => {
	response.writeHead(200);
	response.end('hy there.');
}).listen(PORT, () => console.log('server running at ', PORT));

server.on('upgrade', onSocketUpgrade);

function onSocketUpgrade(req, socket, head) {
	// sec-websocket-key
	const { 'sec-websocket-key': webClientSocketKey } = req.headers;

	console.log(`${webClientSocketKey} connected.`);

	const headers = prepareHandshakeHeaders(webClientSocketKey);
	socket.write(headers);

	socket.on('readable', () => onSocketReadable(socket));
}

function onSocketReadable(socket) {
	// 1 - 1byte - 8bits
	// consume optcode (first byte)
	socket.read(1);
	const [markerAndPayloadLength] = socket.read(1);
	// Because the first bit is always 1 for client-server messages
	// you can subtract one bit (128 or 10000000) from this byte to get rid of the MASK bit
	const lengthIndicatorInBits = markerAndPayloadLength - FIRST_BIT;

	let messageLength = 0;

	if (lengthIndicatorInBits <= SEVEN_BITS_INTEGER_MARKER) {
		messageLength = lengthIndicatorInBits;
	} else {
		throw new Error(
			"your message is too long! we don't handle 64-bit messages."
		);
	}

	const maskkey = socket.read(MASK_KEY_BYTES_LENGTH);

	const encoded = socket.read(messageLength);
	console.log(encoded);
}

function prepareHandshakeHeaders(id) {
	const acceptKey = createSocketAccept(id);
	const headers = [
		'HTTP/1.1 101 Switching Protocols',
		'Upgrade: websocket',
		'Connection: Upgrade',
		`Sec-WebSocket-Accept: ${acceptKey}`,
		'',
	]
		.map((line) => line.concat('\r\n'))
		.join('');
	return headers;
}

function createSocketAccept(id) {
	const shaone = crypto.createHash('sha-1');
	shaone.update(id + WEBSOCKET_MAGIC_STRING_KEY);
	return shaone.digest('base64');
}

errorHandling();

function errorHandling() {
	['uncaughtException', 'unhandledRejection'].forEach((event) =>
		process.on(event, (err) => {
			console.error(
				`something bad happened! event: ${err}, msg: ${err.stack | err}`
			);
		})
	);
}
