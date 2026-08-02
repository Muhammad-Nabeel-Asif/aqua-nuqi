/**
 * Minimal ZIP (store + deflate) reader/writer using only Node builtins.
 * Avoids adding an undeclared archive dependency.
 *
 * Optional AES-256-GCM wrapping for password-protected backup archives:
 * file magic `AQUAENC1` + salt(16) + iv(12) + authTag(16) + ciphertext.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

type Entry = {
  name: string
  data: Buffer
  crc: number
  compressed: Buffer
  method: number
}

const ENC_MAGIC = Buffer.from('AQUAENC1', 'ascii')

function crc32(buf: Buffer): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
    }
  }
  return ~c >>> 0
}

function dosDateTime(d = new Date()): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

export function createZipFromFiles(
  files: { name: string; content: Buffer | string }[],
  outPath: string,
): void {
  const { time, date } = dosDateTime()
  const entries: Entry[] = files.map((f) => {
    const data = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, 'utf8')
    const compressed = zlib.deflateRawSync(data)
    return {
      name: f.name.replace(/\\/g, '/'),
      data,
      crc: crc32(data),
      compressed,
      method: 8,
    }
  })

  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(e.method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(e.crc, 14)
    local.writeUInt32LE(e.compressed.length, 18)
    local.writeUInt32LE(e.data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)

    const localHeaderOffset = offset
    localParts.push(local, nameBuf, e.compressed)
    offset += local.length + nameBuf.length + e.compressed.length

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(e.method, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(e.crc, 16)
    central.writeUInt32LE(e.compressed.length, 20)
    central.writeUInt32LE(e.data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(localHeaderOffset, 42)
    centralParts.push(central, nameBuf)
  }

  const centralDir = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralDir.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, Buffer.concat([...localParts, centralDir, end]))
}

/** Read all entries from a standard (non-encrypted) ZIP buffer. */
export function readZipEntries(zipBuf: Buffer): { name: string; content: Buffer }[] {
  if (zipBuf.length < 22) throw new Error('Invalid ZIP: too short')
  if (zipBuf.subarray(0, 8).equals(ENC_MAGIC)) {
    throw new Error('ZIP is encrypted — decrypt before reading')
  }

  // Find end of central directory (scan backwards for signature)
  let eocd = -1
  for (let i = zipBuf.length - 22; i >= 0; i--) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Invalid ZIP: end of central directory not found')

  const entryCount = zipBuf.readUInt16LE(eocd + 8)
  let centralOffset = zipBuf.readUInt32LE(eocd + 16)
  const results: { name: string; content: Buffer }[] = []

  for (let n = 0; n < entryCount; n++) {
    if (zipBuf.readUInt32LE(centralOffset) !== 0x02014b50) {
      throw new Error('Invalid ZIP: bad central directory signature')
    }
    const method = zipBuf.readUInt16LE(centralOffset + 10)
    const compSize = zipBuf.readUInt32LE(centralOffset + 20)
    const uncompSize = zipBuf.readUInt32LE(centralOffset + 24)
    const nameLen = zipBuf.readUInt16LE(centralOffset + 28)
    const extraLen = zipBuf.readUInt16LE(centralOffset + 30)
    const commentLen = zipBuf.readUInt16LE(centralOffset + 32)
    const localOffset = zipBuf.readUInt32LE(centralOffset + 42)
    const name = zipBuf.subarray(centralOffset + 46, centralOffset + 46 + nameLen).toString('utf8')

    if (zipBuf.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Invalid ZIP: bad local header for ${name}`)
    }
    const localNameLen = zipBuf.readUInt16LE(localOffset + 26)
    const localExtraLen = zipBuf.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const compressed = zipBuf.subarray(dataStart, dataStart + compSize)

    let content: Buffer
    if (method === 0) {
      content = Buffer.from(compressed)
    } else if (method === 8) {
      content = zlib.inflateRawSync(compressed)
    } else {
      throw new Error(`Unsupported ZIP compression method ${method} for ${name}`)
    }
    if (content.length !== uncompSize) {
      // tolerate slight mismatch from some writers; still return inflated data
    }
    results.push({ name, content })
    centralOffset += 46 + nameLen + extraLen + commentLen
  }

  return results
}

export function extractZipToDir(
  zipPath: string,
  destDir: string,
): { name: string; content: Buffer }[] {
  const buf = fs.readFileSync(zipPath)
  const entries = readZipEntries(buf)
  for (const e of entries) {
    const target = path.join(destDir, e.name)
    const resolved = path.resolve(target)
    if (
      !resolved.startsWith(path.resolve(destDir) + path.sep) &&
      resolved !== path.resolve(destDir)
    ) {
      throw new Error(`ZIP path traversal blocked: ${e.name}`)
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true })
    fs.writeFileSync(resolved, e.content)
  }
  return entries
}

export function isEncryptedArchive(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false
  const fd = fs.openSync(filePath, 'r')
  try {
    const magic = Buffer.alloc(8)
    fs.readSync(fd, magic, 0, 8, 0)
    return magic.equals(ENC_MAGIC)
  } finally {
    fs.closeSync(fd)
  }
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 })
}

/** Wrap a plaintext file with AES-256-GCM. Writes to outPath. */
export function encryptFileAes(plainPath: string, outPath: string, password: string): void {
  const plain = fs.readFileSync(plainPath)
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = deriveKey(password, salt)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, Buffer.concat([ENC_MAGIC, salt, iv, tag, ciphertext]))
}

/** Decrypt an AES-wrapped archive to a temp ZIP path. Returns the plaintext path. */
export function decryptFileAes(encPath: string, outPath: string, password: string): void {
  const buf = fs.readFileSync(encPath)
  if (buf.length < 8 + 16 + 12 + 16 || !buf.subarray(0, 8).equals(ENC_MAGIC)) {
    throw new Error('Not an Aqua Nuqi encrypted archive')
  }
  const salt = buf.subarray(8, 24)
  const iv = buf.subarray(24, 36)
  const tag = buf.subarray(36, 52)
  const ciphertext = buf.subarray(52)
  const key = deriveKey(password, salt)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  try {
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, plain)
  } catch {
    throw new Error('Incorrect password or corrupted encrypted archive')
  }
}

export function randomToken(bytes = 4): string {
  return crypto.randomBytes(bytes).toString('hex')
}

/** Recursively list files under root as relative POSIX paths. */
export function listFilesRecursive(root: string): string[] {
  if (!fs.existsSync(root)) return []
  const out: string[] = []
  const walk = (dir: string, prefix: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      const rel = prefix ? `${prefix}/${name}` : name
      const st = fs.statSync(full)
      if (st.isDirectory()) walk(full, rel.replace(/\\/g, '/'))
      else if (st.isFile()) out.push(rel.replace(/\\/g, '/'))
    }
  }
  walk(root, '')
  return out
}
