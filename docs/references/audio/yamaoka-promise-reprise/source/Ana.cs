using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Collections.Generic;

public static class Ana {
    static string[] PC = {"C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"};
    static double[] MAJ = {6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88};
    static double[] MIN = {6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17};

    static float[] Load(string p) {
        byte[] b = File.ReadAllBytes(p);
        float[] x = new float[b.Length / 4];
        Buffer.BlockCopy(b, 0, x, 0, x.Length * 4);
        return x;
    }
    static double Goertzel(float[] x, int start, int n, double f, double sr, double[] win) {
        double w = 2 * Math.PI * f / sr, c = 2 * Math.Cos(w), s1 = 0, s2 = 0;
        for (int i = 0; i < n; i++) { double s = x[start + i] * win[i] + c * s1 - s2; s2 = s1; s1 = s; }
        return s1 * s1 + s2 * s2 - c * s1 * s2;
    }
    static double Corr(double[] a, double[] b) {
        double ma = a.Average(), mb = b.Average(), num = 0, da = 0, db = 0;
        for (int i = 0; i < 12; i++) { num += (a[i]-ma)*(b[i]-mb); da += (a[i]-ma)*(a[i]-ma); db += (b[i]-mb)*(b[i]-mb); }
        return num / Math.Sqrt(da * db + 1e-12);
    }
    static string Key(double[] ch) {
        var r = new List<Tuple<double,string>>();
        for (int k = 0; k < 12; k++) {
            double[] rm = new double[12], rn = new double[12];
            for (int i = 0; i < 12; i++) { rm[(i + k) % 12] = MAJ[i]; rn[(i + k) % 12] = MIN[i]; }
            r.Add(Tuple.Create(Corr(ch, rm), PC[k] + " major"));
            r.Add(Tuple.Create(Corr(ch, rn), PC[k] + " minor"));
        }
        return string.Join(", ", r.OrderByDescending(t => t.Item1).Take(3).Select(t => t.Item2 + " " + t.Item1.ToString("F2")));
    }
    static string Top(double[] ch, int n) {
        double mx = ch.Max() + 1e-12;
        return string.Join(" ", Enumerable.Range(0, 12).OrderByDescending(i => ch[i]).Take(n).Select(i => PC[i] + ":" + (ch[i] / mx).ToString("F2")));
    }

    public static string Run(string path, double seg) {
        var sb = new StringBuilder();
        double sr = 11025; float[] x = Load(path);
        int N = 8192, hop = 4096;
        double[] win = new double[N]; for (int i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.Cos(2 * Math.PI * i / (N - 1));
        int NL = 16384; double[] winL = new double[NL]; for (int i = 0; i < NL; i++) winL[i] = 0.5 - 0.5 * Math.Cos(2 * Math.PI * i / (NL - 1));
        double[] glob = new double[12];
        double[] segc = new double[12]; double[] bass = new double[25]; double segStart = 0;
        sb.AppendLine("duration " + (x.Length / sr).ToString("F1") + "s");
        for (int st = 0; st + NL < x.Length; st += hop) {
            double t = st / sr;
            double[] fr = new double[12];
            for (int m = 48; m <= 88; m++) { double e = Goertzel(x, st, N, 440 * Math.Pow(2, (m - 69) / 12.0), sr, win); fr[m % 12] += Math.Sqrt(e); }
            double tot = fr.Sum() + 1e-9;
            for (int i = 0; i < 12; i++) { segc[i] += fr[i] / tot; glob[i] += fr[i]; }
            for (int m = 28; m <= 52; m++) bass[m - 28] += Math.Sqrt(Goertzel(x, st, NL, 440 * Math.Pow(2, (m - 69) / 12.0), sr, winL));
            if (t - segStart >= seg) {
                int bm = Enumerable.Range(0, 25).OrderByDescending(i => bass[i]).First() + 28;
                int bm2 = Enumerable.Range(0, 25).OrderByDescending(i => bass[i]).Skip(1).First() + 28;
                sb.AppendLine(string.Format("{0,6:F1}-{1,6:F1}s  top: {2}  | bass: {3}{4} / {5}{6}", segStart, t, Top(segc, 5), PC[bm % 12], bm / 12 - 1, PC[bm2 % 12], bm2 / 12 - 1));
                segc = new double[12]; bass = new double[25]; segStart = t;
            }
        }
        sb.AppendLine("GLOBAL chroma: " + Top(glob, 12));
        sb.AppendLine("KEY (Krumhansl): " + Key(glob));
        // tempo: onset envelope via energy flux in 32 bands
        int fn = 512, fh = 256; int nf = (x.Length - fn) / fh; double[] env = new double[nf]; double[] prev = null;
        for (int f = 0; f < nf; f++) {
            double[] bands = new double[16];
            for (int b = 0; b < 16; b++) { double lo = 60 * Math.Pow(2, b * 0.45); bands[b] = Math.Log(1e-6 + Goertzel(x, f * fh, fn, lo, sr, Enumerable.Repeat(1.0, fn).ToArray())); }
            if (prev != null) { double fl = 0; for (int b = 0; b < 16; b++) fl += Math.Max(0, bands[b] - prev[b]); env[f] = fl; }
            prev = bands;
        }
        double mean = env.Average(); for (int i = 0; i < nf; i++) env[i] -= mean;
        double fps = sr / fh; var res = new List<Tuple<double,double>>();
        for (double bpm = 40; bpm <= 200; bpm += 0.5) {
            double lag = 60.0 / bpm * fps; int L = (int)Math.Round(lag); double ac = 0;
            for (int i = 0; i + L < nf; i++) ac += env[i] * env[i + L];
            res.Add(Tuple.Create(ac / (nf - L), bpm));
        }
        sb.AppendLine("TEMPO candidates (autocorr): " + string.Join(", ", res.OrderByDescending(r => r.Item1).Take(6).Select(r => r.Item2.ToString("F1"))));
        return sb.ToString();
    }
}
