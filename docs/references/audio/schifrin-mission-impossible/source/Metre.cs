using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Collections.Generic;

public static class Metre {
    public static int Smooth = 0; // frames of box smoothing on the onset envelope; 2 for synthetic renders with razor-sharp onsets
    static float[] Load(string p) { byte[] b = File.ReadAllBytes(p); float[] x = new float[b.Length / 4]; Buffer.BlockCopy(b, 0, x, 0, x.Length * 4); return x; }
    // onset envelope from 8 log bands via simple one-pole band energies on 256-sample frames (11025 Hz)
    static double[] Env(float[] x, int fh, double lo, double hi) {
        int nf = x.Length / fh; double[] e = new double[nf]; double prev = 0;
        // crude band split: one-pole lowpass at hi minus lowpass at lo
        double sr = 11025, aH = Math.Exp(-2 * Math.PI * hi / sr), aL = Math.Exp(-2 * Math.PI * lo / sr), yH = 0, yL = 0;
        for (int f = 0; f < nf; f++) {
            double s = 0;
            for (int i = f * fh; i < (f + 1) * fh; i++) { yH = (1 - aH) * x[i] + aH * yH; yL = (1 - aL) * x[i] + aL * yL; double b = yH - yL; s += b * b; }
            double l = Math.Log(1e-9 + s); e[f] = Math.Max(0, l - prev); prev = l;
        }
        if (Smooth > 0) { double[] s2 = new double[nf]; for (int i = 0; i < nf; i++) { double a = 0; int c = 0; for (int k = -Smooth; k <= Smooth; k++) { int j = i + k; if (j >= 0 && j < nf) { a += e[j]; c++; } } s2[i] = a / c; } e = s2; }
        double m = e.Average(); for (int i = 0; i < nf; i++) e[i] -= m; return e;
    }
    static double AC(double[] e, double lag) { int L = (int)Math.Round(lag); double a = 0; for (int i = 0; i + L < e.Length; i++) a += e[i] * e[i + L]; return a / (e.Length - L); }
    public static string Run(string path, double t0, double t1) {
        var sb = new StringBuilder(); float[] x = Load(path); double sr = 11025; int fh = 128; double fps = sr / fh;
        int a = (int)(t0 * sr), b = Math.Min(x.Length, (int)(t1 * sr)); float[] y = new float[b - a]; Array.Copy(x, a, y, 0, y.Length);
        foreach (var band in new[] { new[] { 30.0, 150 }, new[] { 150.0, 1500 }, new[] { 2000.0, 5000 }, new[] { 30.0, 5000 } }) {
            double[] e = Env(y, fh, band[0], band[1]);
            var res = new List<Tuple<double, double>>();
            for (double bpm = 60; bpm <= 200; bpm += 0.5) res.Add(Tuple.Create(AC(e, 60.0 / bpm * fps), bpm));
            var top = res.OrderByDescending(r => r.Item1).Take(5).Select(r => r.Item2.ToString("F1"));
            double best = res.OrderByDescending(r => r.Item1).First().Item2;
            sb.AppendLine(string.Format("  band {0}-{1} Hz  tempo: {2}", band[0], band[1], string.Join(", ", top)));
            // metre: compare autocorr at 2..7 beats of the best tempo in 60-200 (use the band-best beat)
            double spb = 60.0 / best * fps; var m = new List<string>();
            for (int k = 2; k <= 8; k++) m.Add(k + ":" + (AC(e, k * spb) / AC(e, spb)).ToString("F2"));
            sb.AppendLine("     bar-lag autocorr (beats:ratio to 1-beat) " + string.Join(" ", m));
        }
        return sb.ToString();
    }
}
