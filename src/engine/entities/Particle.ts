/** A single burst-effect particle (explosion debris, spark). Pooled and reused. */
export class Particle {
  active = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  life = 0;
  maxLife = 1;
  color = '#fff';
  size = 2;
}
