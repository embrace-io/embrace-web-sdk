const count = Math.floor(Math.random() * 4) + 2;
for (let i = 0; i < count; i++) {
  setTimeout(() => {
    const start = Date.now();
    while (Date.now() - start < 400) {}
  }, Math.random() * 2000);
}
