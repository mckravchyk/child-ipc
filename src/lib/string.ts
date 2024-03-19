// Not using nanoid to keep the number of dependencies smaller - the alphabet and the default
// length is the same.
export function generateId(length = 21): string {
  let id = '';

  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const charsetSize = charset.length;

  for (let i = 0; i < length; i += 1) {
    id += charset.charAt(Math.floor(Math.random() * charsetSize));
  }

  return id;
}
