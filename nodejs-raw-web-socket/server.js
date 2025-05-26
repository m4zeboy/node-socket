import crypto from 'node:crypto';
import { createServer } from 'node:http';
const PORT = 1337;
const WEBSOCKET_MAGIC_STRING_KEY = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const SEVEN_BITS_INTEGER_MARKER = 125;
const SIXTEEN_BITS_INTEGER_MARKER = 126;
const SIXTYFOUR_BITS_INTEGER_MARKER = 127;

const OPCODE_TEXT = 0x01; // 1bit in binary

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

function sendMessage(message, socket) {
	const dataFrame = prepareMessage(message);
	socket.write(dataFrame);
}

function prepareMessage(message) {
	const msg = Buffer.from(message);
	const messageSize = msg.length;

	let dataFrameBuffer;
	let offset = 2;

	// 0x80 === 128 in binary
	// '0x' + Math.abs(128).toString(16);
	const firstByte = 0x80 | OPCODE_TEXT; // single frame + text
	if (messageSize <= SEVEN_BITS_INTEGER_MARKER) {
		const bytes = [firstByte];
		dataFrameBuffer = Buffer.from(bytes.concat(messageSize));
	} else {
		throw new Error('message too long buddy :(');
	}

	const totalLength = dataFrameBuffer.byteLength + messageSize;
	const dataFrameResponse = concat([dataFrameBuffer, msg], totalLength);

	return dataFrameResponse;
}

function concat(bufferList, totalLength) {
	const target = Buffer.allocUnsafe(totalLength);
	let offset = 0;
	for (const buffer of bufferList) {
		target.set(buffer, offset);
		offset += buffer.length;
	}
	return target;
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
	const decoded = unmask(encoded, maskkey);
	const received = decoded.toString('utf-8');

	const data = JSON.parse(received);
	console.log('message received', data);

	const message = JSON.stringify({
		message: data,
		at: new Date().toISOString(),
	});
	sendMessage(message, socket);
}

function unmask(encodedBufer, maskKey) {
	// because the mask key has only four bytes
	// we do index % 4 === 0, 1, 2, 3 = index bits needed to decode the message

	// XOR ^
	//

	// (21).toString(2).padStart(8, "0") - 0 1 0 1 0 1
	// (53).toString(2).padStart(8, "0") - 1 1 0 1 0 1
	// ^                                 - 1 0 0 0 0 0
	// String.fromCharCode()
	// (21 ^ 53).toString(2).padStart(8, "0") = 0 0 1 0 0 0 0 0

	const fillWithRightZeros = (t) => t.padStart(8, '0');

	const toBinary = (t) => fillWithRightZeros(t.toString(2));

	const fromBinaryToDecimal = (t) => parseInt(toBinary(t), 2);

	const getCharFromBinary = (t) => String.fromCharCode(fromBinaryToDecimal(t));

	const finalBuffer = Buffer.from(encodedBufer);
	for (let i = 0; i < encodedBufer.length; i++) {
		finalBuffer[i] = encodedBufer[i] ^ maskKey[i % MASK_KEY_BYTES_LENGTH];
		const logger = {
			unmaskingCalc: `${toBinary(encodedBufer[i])} ^ ${toBinary(
				maskKey[i % MASK_KEY_BYTES_LENGTH]
			)} = ${toBinary(finalBuffer[i])}`,
			decoded: getCharFromBinary(finalBuffer[i]),
		};
		console.log(logger);
	}
	return finalBuffer;
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
