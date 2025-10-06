if (document.startViewTransition) {
  document.startViewTransition(() => {
    console.log("Transition!");
  });
}

navigator.clipboard?.readText?.().then(t => console.log(t)).catch(() => {});
