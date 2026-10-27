declare module "gsap" {
  const gsap: any
  export default gsap
  export { gsap }
}

declare module "gsap/ScrollTrigger" {
  export const ScrollTrigger: any
}
